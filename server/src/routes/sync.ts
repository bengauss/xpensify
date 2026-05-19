import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";
import { resetMerchantMemory, resolveCanonical } from "../lib/merchantMemory.js";

interface ClientChange {
  id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note?: string | null;
  tags?: string | null;
  image_url?: string | null;
  timestamp: string;
  source?: string;
  recurring_template_id?: string | null;
  deleted?: number;
  updated_at?: string;
}

interface ExpenseRow {
  id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note: string | null;
  tags: string | null;
  image_url: string | null;
  timestamp: string;
  source: string;
  recurring_template_id: string | null;
  deleted: number;
  auto_saved: number;
  created_at: string;
  updated_at: string;
}

const MAX_NOTE_LENGTH = 1000;

const sync = new Hono<{ Variables: Variables }>()
  // POST /api/sync
  .post("/", authMiddleware, async (c) => {
    let body: { changes?: unknown; last_sync?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const userId = c.get("userId");
    const changes: ClientChange[] = Array.isArray(body.changes) ? (body.changes as ClientChange[]) : [];
    const lastSync: string | null =
      typeof body.last_sync === "string" ? body.last_sync : null;

    const selectExistingStmt = db.prepare<[string], {
      updated_at: string;
      source: string;
      category_id: string | null;
      subcategory_id: string | null;
      note: string | null;
    }>(
      `SELECT updated_at, source, category_id, subcategory_id, note FROM expenses WHERE id = ?`
    );

    const insertStmt = db.prepare<[string, string, string, string, number, string | null, string | null, string | null, string, string, string | null, number, string]>(
      `INSERT INTO expenses
         (id, user_id, category_id, subcategory_id, amount, note, tags, image_url, timestamp, source, recurring_template_id, deleted, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const updateStmt = db.prepare<[string, string, number, string | null, string | null, string | null, string, string, string | null, number, string, string]>(
      `UPDATE expenses SET
         category_id = ?,
         subcategory_id = ?,
         amount = ?,
         note = ?,
         tags = ?,
         image_url = ?,
         timestamp = ?,
         source = ?,
         recurring_template_id = ?,
         deleted = ?,
         updated_at = ?
       WHERE id = ?`
    );

    const subcategoryCheckStmt = db.prepare<[string, string], { id: string }>(
      `SELECT id FROM subcategories WHERE id = ? AND category_id = ?`
    );

    // Track IDs that were accepted (client's version won and server now stores it).
    // Rejected IDs (server had newer version) must be included in the delta so the
    // client receives the authoritative state.
    const acceptedIds: string[] = [];

    const runTransaction = db.transaction(() => {
      for (const change of changes) {
        if (typeof change.id !== "string" || !change.id) continue;

        // Reject malformed/oversized notes rather than silently truncating
        if (typeof change.note === "string" && change.note.length > MAX_NOTE_LENGTH) {
          console.warn(`[sync] rejecting ${change.id}: note exceeds ${MAX_NOTE_LENGTH} chars`);
          continue;
        }

        // Validate that subcategory belongs to the claimed category
        const sub = subcategoryCheckStmt.get(change.subcategory_id, change.category_id);
        if (!sub) {
          console.warn(`[sync] rejecting ${change.id}: subcategory ${change.subcategory_id} does not belong to category ${change.category_id}`);
          continue;
        }

        const existing = selectExistingStmt.get(change.id);
        const clientUpdatedAt = typeof change.updated_at === "string" ? change.updated_at : "";
        const now = new Date().toISOString();

        if (!existing) {
          insertStmt.run(
            change.id,
            userId,
            change.category_id,
            change.subcategory_id,
            change.amount,
            change.note ?? null,
            change.tags ?? null,
            change.image_url ?? null,
            change.timestamp,
            change.source ?? "manual",
            change.recurring_template_id ?? null,
            change.deleted ?? 0,
            now
          );
          acceptedIds.push(change.id);
        } else if (clientUpdatedAt > existing.updated_at) {
          updateStmt.run(
            change.category_id,
            change.subcategory_id,
            change.amount,
            change.note ?? null,
            change.tags ?? null,
            change.image_url ?? null,
            change.timestamp,
            change.source ?? "manual",
            change.recurring_template_id ?? null,
            change.deleted ?? 0,
            now,
            change.id
          );
          acceptedIds.push(change.id);

          // Recategorization signal: if a user just edited an Apple Pay
          // expense and changed its category, the auto-save mapping was
          // wrong for this transaction. Reset the household's merchant
          // memory to count=1 with the new mapping — next transaction at
          // this merchant will go pending so it can be confirmed.
          // Skip soft-deletes (deleted=1 isn't a recategorization signal).
          if (
            existing.source === "apple-pay" &&
            (change.deleted ?? 0) === 0 &&
            existing.category_id !== change.category_id
          ) {
            const merchantNormalized = resolveCanonical(
              (existing.note ?? "").trim(),
            );
            if (merchantNormalized) {
              resetMerchantMemory(
                merchantNormalized,
                change.category_id,
                change.subcategory_id,
                new Date().toISOString(),
              );
            }
          }
        }
        // else: server has a newer version — don't push to acceptedIds so the
        // authoritative server row flows back in the delta below.
      }

      let serverChanges: ExpenseRow[];

      if (lastSync === null) {
        // Initial sync / cache clear: return ALL records including soft-deleted
        // tombstones so the client's view stays consistent after future deletes.
        // Exclude pending expenses entirely — they live server-side until the
        // user confirms them in-app, and only then enter the sync stream.
        serverChanges = db
          .prepare(`SELECT * FROM expenses WHERE status = 'confirmed'`)
          .all() as ExpenseRow[];
      } else if (acceptedIds.length > 0) {
        const placeholders = acceptedIds.map(() => "?").join(", ");
        serverChanges = db
          .prepare(
            `SELECT * FROM expenses
             WHERE updated_at > ?
               AND status = 'confirmed'
               AND id NOT IN (${placeholders})`
          )
          .all(lastSync, ...acceptedIds) as ExpenseRow[];
      } else {
        serverChanges = db
          .prepare(
            `SELECT * FROM expenses WHERE updated_at > ? AND status = 'confirmed'`
          )
          .all(lastSync) as ExpenseRow[];
      }

      return serverChanges;
    });

    const serverChanges = runTransaction();

    // Always return full categories and subcategories (they change rarely)
    const categories = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order`)
      .all();
    const subcategories = db
      .prepare(`SELECT * FROM subcategories ORDER BY sort_order`)
      .all();

    // Always return full users list — small, infrequently-changing, and
    // EXPLICITLY excluding password_hash and other sensitive/internal columns.
    // History.tsx reads this to render the per-user initial badge.
    const users = db
      .prepare(
        `SELECT id, username, display_name, avatar_color FROM users ORDER BY username`,
      )
      .all();

    // sync_timestamp: server's current time
    const syncTimestamp = new Date().toISOString();

    return c.json({
      server_changes: serverChanges,
      sync_timestamp: syncTimestamp,
      categories,
      subcategories,
      users,
    });
  });

export default sync;
