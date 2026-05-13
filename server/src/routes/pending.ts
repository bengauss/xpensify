import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";
import { upsertMerchantMemory, lookupMerchantMemory } from "../lib/merchantMemory.js";

interface PendingRow {
  id: string;
  user_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  note: string | null;
  timestamp: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/** Server-decided origin of a suggestion attached to a pending row. */
type SuggestionSource = "memory" | "flash" | null;

const MAX_NOTE_LENGTH = 1000;

const pending = new Hono<{ Variables: Variables }>()
  .use("/*", authMiddleware)
  // GET / — pending expenses for the current user. category_id/subcategory_id
  // are non-null when the shortcut webhook attached a suggestion. The origin
  // (user-trained memory vs Gemini Flash) decides the Confirm-screen hint:
  // memory → "confirmed once before", flash → "AI suggestion". Inferred from
  // merchant_categories presence rather than stored on the row.
  .get("/", (c) => {
    const userId = c.get("userId");
    const rows = db
      .prepare(
        `SELECT id, amount, note, timestamp, source, created_at,
                category_id, subcategory_id
         FROM expenses
         WHERE user_id = ? AND status = 'pending' AND deleted = 0
         ORDER BY timestamp DESC`
      )
      .all(userId) as Array<Omit<PendingRow, "user_id" | "updated_at">>;
    const enriched = rows.map((r) => {
      let suggestion_source: SuggestionSource = null;
      if (r.category_id && r.subcategory_id && r.source === "apple-pay") {
        const merchant = (r.note ?? "").trim();
        suggestion_source = merchant && lookupMerchantMemory(merchant)
          ? "memory"
          : "flash";
      }
      return { ...r, suggestion_source };
    });
    return c.json(enriched);
  })
  // PATCH /:id/confirm — assign category, optionally edit amount/note, flip status
  .patch("/:id/confirm", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");

    let body: {
      category_id?: unknown;
      subcategory_id?: unknown;
      amount?: unknown;
      note?: unknown;
    };
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

    const existing = db
      .prepare(
        `SELECT * FROM expenses
         WHERE id = ? AND user_id = ? AND status = 'pending' AND deleted = 0`
      )
      .get(id, userId) as PendingRow | undefined;

    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }

    let amountCents = existing.amount;
    if (body.amount !== undefined) {
      if (typeof body.amount !== "number" || !isFinite(body.amount) || body.amount <= 0) {
        return c.json({ error: "amount must be a positive number (cents)" }, 400);
      }
      amountCents = Math.round(body.amount);
    }

    let note = existing.note;
    if (body.note !== undefined) {
      if (body.note === null) {
        note = null;
      } else if (typeof body.note !== "string") {
        return c.json({ error: "note must be a string or null" }, 400);
      } else if (body.note.length > MAX_NOTE_LENGTH) {
        return c.json({ error: `note must be ${MAX_NOTE_LENGTH} characters or fewer` }, 400);
      } else {
        const trimmed = body.note.trim();
        note = trimmed === "" ? null : trimmed;
      }
    }

    const categoryId = body.category_id;
    const subcategoryId = body.subcategory_id;
    // The pending row's `note` field holds the already-normalized merchant —
    // don't re-normalize. If the user rewrote the note we still key memory on
    // the original normalized merchant from the pending row.
    const merchantNormalized = (existing.note ?? "").trim();
    const nowIso = new Date().toISOString();

    // Detect "user accepted a Gemini Flash suggestion": the pending row had a
    // pre-filled (cat, sub), no merchant_categories row exists yet (so the
    // pre-fill couldn't have come from memory), and the user confirmed the
    // suggested values unchanged. In that case we count Flash + user as two
    // votes and seed the new memory row at count=2 — next hit auto-saves.
    const hadSuggestion =
      existing.category_id !== null && existing.subcategory_id !== null;
    const noMemoryYet =
      existing.source === "apple-pay" && merchantNormalized
        ? lookupMerchantMemory(merchantNormalized) === null
        : false;
    const flashAccepted =
      noMemoryYet &&
      hadSuggestion &&
      existing.category_id === categoryId &&
      existing.subcategory_id === subcategoryId;

    const commit = db.transaction(() => {
      db.prepare(
        `UPDATE expenses SET
           category_id = ?,
           subcategory_id = ?,
           amount = ?,
           note = ?,
           status = 'confirmed',
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(categoryId, subcategoryId, amountCents, note, id);

      if (existing.source === "apple-pay" && merchantNormalized) {
        upsertMerchantMemory(
          merchantNormalized,
          categoryId,
          subcategoryId,
          nowIso,
          flashAccepted ? { initialCount: 2 } : undefined,
        );
      }
    });
    commit();

    const updated = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(id);
    return c.json(updated);
  })
  // DELETE /:id — skip (hard delete since it never reached confirmed state)
  .delete("/:id", (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");

    const result = db
      .prepare(
        `DELETE FROM expenses
         WHERE id = ? AND user_id = ? AND status = 'pending'`
      )
      .run(id, userId);

    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

export default pending;
