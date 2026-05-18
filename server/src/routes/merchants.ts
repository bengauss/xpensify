import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

interface MerchantRow {
  merchant_normalized: string;
  category_id: string;
  subcategory_id: string;
  confirmation_count: number;
  last_confirmed_at: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  subcategory_name: string | null;
  auto_saved_count: number;
}

const merchants = new Hono<{ Variables: Variables }>()
  .use("/*", authMiddleware)
  // GET / — list all household merchant memory entries with joined category
  // names and a count of household-wide auto-saves at each merchant.
  .get("/", (c) => {
    const rows = db
      .prepare(
        `SELECT m.merchant_normalized, m.category_id, m.subcategory_id,
                m.confirmation_count, m.last_confirmed_at,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                s.name AS subcategory_name,
                COALESCE(a.auto_saved_count, 0) AS auto_saved_count
         FROM merchant_categories m
         LEFT JOIN categories c ON c.id = m.category_id
         LEFT JOIN subcategories s ON s.id = m.subcategory_id
         LEFT JOIN (
           SELECT note, COUNT(*) AS auto_saved_count
           FROM expenses
           WHERE source = 'apple-pay' AND auto_saved = 1 AND deleted = 0
           GROUP BY note
         ) a ON a.note = m.merchant_normalized
         ORDER BY m.confirmation_count DESC, m.last_confirmed_at DESC`,
      )
      .all() as MerchantRow[];
    return c.json(rows);
  })
  // PATCH /:merchant — update mapping (resets count to 1; user is overriding)
  .patch("/:merchant", async (c) => {
    const merchant = decodeURIComponent(c.req.param("merchant"));

    let body: { category_id?: unknown; subcategory_id?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (typeof body.category_id !== "string" || typeof body.subcategory_id !== "string") {
      return c.json({ error: "category_id and subcategory_id are required" }, 400);
    }

    const sub = db
      .prepare(`SELECT id FROM subcategories WHERE id = ? AND category_id = ?`)
      .get(body.subcategory_id, body.category_id);
    if (!sub) {
      return c.json({ error: "subcategory does not belong to category" }, 400);
    }

    const result = db
      .prepare(
        `UPDATE merchant_categories
         SET category_id = ?,
             subcategory_id = ?,
             confirmation_count = 1,
             last_confirmed_at = ?
         WHERE merchant_normalized = ?`,
      )
      .run(body.category_id, body.subcategory_id, new Date().toISOString(), merchant);

    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  })
  // DELETE /:merchant — remove the mapping entirely
  .delete("/:merchant", (c) => {
    const merchant = decodeURIComponent(c.req.param("merchant"));
    const result = db
      .prepare(
        `DELETE FROM merchant_categories WHERE merchant_normalized = ?`,
      )
      .run(merchant);
    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  })
  // POST /:merchant/merge — collapse one merchant into another. Creates an
  // alias so future webhook hits at the alias name resolve to the canonical;
  // deletes the alias's own merchant_categories row (the canonical's mapping
  // wins); rewrites historical apple-pay expense notes from alias → canonical,
  // but only for rows whose note still equals the alias verbatim — never
  // clobbers a user-edited note. Atomic; transitively flattens any pre-existing
  // alias chain so we never resolve more than one hop at read time.
  .post("/:merchant/merge", async (c) => {
    const alias = decodeURIComponent(c.req.param("merchant")).trim();

    let body: { into?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (typeof body.into !== "string" || body.into.trim() === "") {
      return c.json({ error: "into is required" }, 400);
    }
    const intoRaw = body.into.trim();
    if (alias === "") {
      return c.json({ error: "alias merchant required in path" }, 400);
    }
    if (alias === intoRaw) {
      return c.json({ error: "cannot merge a merchant into itself" }, 400);
    }

    // If the target itself has an alias, resolve through it so we always
    // store the deepest canonical and never create a chain to walk later.
    const intoAliasRow = db
      .prepare(
        `SELECT canonical_normalized FROM merchant_aliases
         WHERE alias_normalized = ?`,
      )
      .get(intoRaw) as { canonical_normalized: string } | undefined;
    const canonical = intoAliasRow ? intoAliasRow.canonical_normalized : intoRaw;

    if (alias === canonical) {
      return c.json({ error: "cannot merge a merchant into itself" }, 400);
    }

    const nowIso = new Date().toISOString();
    const merge = db.transaction(() => {
      // Replace any existing alias row for `alias` (e.g. re-merging after an
      // un-merge) and any rows that previously pointed at `alias` as their
      // canonical so we don't leave dangling intermediate aliases.
      db.prepare(
        `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(alias_normalized) DO UPDATE SET
           canonical_normalized = excluded.canonical_normalized,
           created_at = excluded.created_at`,
      ).run(alias, canonical, nowIso);

      db.prepare(
        `UPDATE merchant_aliases SET canonical_normalized = ?
         WHERE canonical_normalized = ?`,
      ).run(canonical, alias);

      // The canonical's mapping wins — drop the alias's own memory row if any.
      db.prepare(
        `DELETE FROM merchant_categories WHERE merchant_normalized = ?`,
      ).run(alias);

      // Relabel historical untouched apple-pay notes so History reads
      // consistently. note=alias is the never-edited case (insert sets note
      // to the normalized merchant). updated_at bumped so the row syncs.
      const updated = db
        .prepare(
          `UPDATE expenses
           SET note = ?, updated_at = ?
           WHERE note = ? AND source = 'apple-pay' AND deleted = 0`,
        )
        .run(canonical, nowIso, alias);
      return updated.changes;
    });

    const notesUpdated = merge() as number;
    return c.json({ ok: true, canonical, notes_updated: notesUpdated });
  })
  // GET /aliases — list every alias entry with the resolver target. Surfaced
  // in the Settings → Merchants screen as an un-merge affordance.
  .get("/aliases", (c) => {
    const rows = db
      .prepare(
        `SELECT alias_normalized, canonical_normalized, created_at
         FROM merchant_aliases
         ORDER BY canonical_normalized, alias_normalized`,
      )
      .all() as Array<{
        alias_normalized: string;
        canonical_normalized: string;
        created_at: string;
      }>;
    return c.json(rows);
  })
  // DELETE /aliases/:alias — undo a merge. Future webhook hits with the
  // de-aliased name will start fresh (no auto-save until reconfirmed).
  .delete("/aliases/:alias", (c) => {
    const alias = decodeURIComponent(c.req.param("alias"));
    const result = db
      .prepare(`DELETE FROM merchant_aliases WHERE alias_normalized = ?`)
      .run(alias);
    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  })
  // POST /import — backfill merchant memory from existing confirmed apple-pay
  // expenses across both household members. Groups by normalized merchant,
  // picks the (category, subcategory) pair that appears most often, and
  // stamps confirmation_count to that count. Skips merchants already in
  // memory — never overwrites prior input.
  .post("/import", (c) => {
    const rows = db
      .prepare(
        `SELECT note AS merchant, category_id, subcategory_id, COUNT(*) AS count
         FROM expenses
         WHERE source = 'apple-pay'
           AND status = 'confirmed'
           AND deleted = 0
           AND note IS NOT NULL AND note <> ''
           AND category_id IS NOT NULL AND subcategory_id IS NOT NULL
         GROUP BY note, category_id, subcategory_id`,
      )
      .all() as Array<{
        merchant: string;
        category_id: string;
        subcategory_id: string;
        count: number;
      }>;

    // For each merchant, pick the (cat, sub) pair with the highest count.
    const best = new Map<
      string,
      { category_id: string; subcategory_id: string; count: number }
    >();
    for (const r of rows) {
      const m = r.merchant.trim();
      if (!m) continue;
      const cur = best.get(m);
      if (!cur || r.count > cur.count) {
        best.set(m, { category_id: r.category_id, subcategory_id: r.subcategory_id, count: r.count });
      }
    }

    let inserted = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    const checkStmt = db.prepare(
      `SELECT 1 FROM merchant_categories WHERE merchant_normalized = ?`,
    );
    const insertStmt = db.prepare(
      `INSERT INTO merchant_categories
         (merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const importTx = db.transaction(() => {
      for (const [merchant, pick] of best) {
        if (checkStmt.get(merchant)) {
          skipped += 1;
          continue;
        }
        insertStmt.run(merchant, pick.category_id, pick.subcategory_id, pick.count, nowIso);
        inserted += 1;
      }
    });
    importTx();

    return c.json({ inserted, skipped, total: best.size });
  });

export default merchants;
