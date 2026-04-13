import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const sync = new Hono<{ Variables: Variables }>();

interface ClientChange {
  id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note?: string | null;
  tags?: string | null;
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
  timestamp: string;
  source: string;
  recurring_template_id: string | null;
  deleted: number;
  created_at: string;
  updated_at: string;
}

// POST /api/sync
sync.post("/", authMiddleware, async (c) => {
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

  // Server is clock authority: updated_at = datetime('now') on every upsert.
  // Last sync to arrive always wins (last-write-wins by arrival order).
  const upsertStmt = db.prepare<[string, string, string, string, number, string | null, string | null, string, string, string | null, number]>(
    `INSERT INTO expenses
       (id, user_id, category_id, subcategory_id, amount, note, tags, timestamp, source, recurring_template_id, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       category_id           = excluded.category_id,
       subcategory_id        = excluded.subcategory_id,
       amount                = excluded.amount,
       note                  = excluded.note,
       tags                  = excluded.tags,
       timestamp             = excluded.timestamp,
       source                = excluded.source,
       recurring_template_id = excluded.recurring_template_id,
       deleted               = excluded.deleted,
       updated_at            = datetime('now')`
  );

  const appliedIds: string[] = [];

  const runTransaction = db.transaction(() => {
    for (const change of changes) {
      upsertStmt.run(
        change.id,
        userId,
        change.category_id,
        change.subcategory_id,
        change.amount,
        change.note ?? null,
        change.tags ?? null,
        change.timestamp,
        change.source ?? "manual",
        change.recurring_template_id ?? null,
        change.deleted ?? 0
      );
      appliedIds.push(change.id);
    }

    let serverChanges: ExpenseRow[];

    if (lastSync === null) {
      // Initial sync: return all non-deleted expenses (shared household)
      serverChanges = db
        .prepare(
          `SELECT * FROM expenses WHERE deleted = 0`
        )
        .all() as ExpenseRow[];
    } else if (appliedIds.length > 0) {
      const placeholders = appliedIds.map(() => "?").join(", ");
      serverChanges = db
        .prepare(
          `SELECT * FROM expenses
           WHERE updated_at > ?
             AND id NOT IN (${placeholders})`
        )
        .all(lastSync, ...appliedIds) as ExpenseRow[];
    } else {
      serverChanges = db
        .prepare(
          `SELECT * FROM expenses WHERE updated_at > ?`
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

  // sync_timestamp: server's current time
  const syncTimestamp = (
    db.prepare("SELECT datetime('now') as now").get() as { now: string }
  ).now;

  return c.json({
    server_changes: serverChanges,
    sync_timestamp: syncTimestamp,
    categories,
    subcategories,
  });
});

export default sync;
