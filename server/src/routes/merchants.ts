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
  // GET / — list current user's merchant memory entries with category names
  // and a count of how many times we've auto-saved an expense at each merchant.
  .get("/", (c) => {
    const userId = c.get("userId");
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
           SELECT note, user_id, COUNT(*) AS auto_saved_count
           FROM expenses
           WHERE source = 'apple-pay' AND auto_saved = 1 AND deleted = 0
           GROUP BY user_id, note
         ) a ON a.user_id = m.user_id AND a.note = m.merchant_normalized
         WHERE m.user_id = ?
         ORDER BY m.confirmation_count DESC, m.last_confirmed_at DESC`,
      )
      .all(userId) as MerchantRow[];
    return c.json(rows);
  })
  // PATCH /:merchant — update mapping (resets count to 1; user is overriding)
  .patch("/:merchant", async (c) => {
    const userId = c.get("userId");
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
         WHERE user_id = ? AND merchant_normalized = ?`,
      )
      .run(body.category_id, body.subcategory_id, new Date().toISOString(), userId, merchant);

    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  })
  // DELETE /:merchant — remove the mapping entirely
  .delete("/:merchant", (c) => {
    const userId = c.get("userId");
    const merchant = decodeURIComponent(c.req.param("merchant"));
    const result = db
      .prepare(
        `DELETE FROM merchant_categories WHERE user_id = ? AND merchant_normalized = ?`,
      )
      .run(userId, merchant);
    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  })
  // POST /import — backfill merchant memory from existing confirmed apple-pay
  // expenses. Groups by normalized merchant, picks the (category, subcategory)
  // pair that appears most often, and stamps confirmation_count to that
  // count. Skips merchants already in memory — never overwrites user input.
  .post("/import", (c) => {
    const userId = c.get("userId");
    const rows = db
      .prepare(
        `SELECT note AS merchant, category_id, subcategory_id, COUNT(*) AS count
         FROM expenses
         WHERE user_id = ?
           AND source = 'apple-pay'
           AND status = 'confirmed'
           AND deleted = 0
           AND note IS NOT NULL AND note <> ''
           AND category_id IS NOT NULL AND subcategory_id IS NOT NULL
         GROUP BY note, category_id, subcategory_id`,
      )
      .all(userId) as Array<{
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
      `SELECT 1 FROM merchant_categories
       WHERE user_id = ? AND merchant_normalized = ?`,
    );
    const insertStmt = db.prepare(
      `INSERT INTO merchant_categories
         (user_id, merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const importTx = db.transaction(() => {
      for (const [merchant, pick] of best) {
        if (checkStmt.get(userId, merchant)) {
          skipped += 1;
          continue;
        }
        insertStmt.run(userId, merchant, pick.category_id, pick.subcategory_id, pick.count, nowIso);
        inserted += 1;
      }
    });
    importTx();

    return c.json({ inserted, skipped, total: best.size });
  });

export default merchants;
