import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const historyMarker = new Hono<{ Variables: Variables }>()
  .use("/*", authMiddleware)
  // GET / — does the current user have any auto-saved Apple Pay expenses
  // created since the last time they visited History?
  .get("/", (c) => {
    const userId = c.get("userId");
    const user = db
      .prepare(`SELECT last_history_visit_at FROM users WHERE id = ?`)
      .get(userId) as { last_history_visit_at: string | null } | undefined;
    const lastVisit = user?.last_history_visit_at ?? null;

    const row = db
      .prepare(
        // Auto-saved expenses are status='confirmed' from the shortcut
        // webhook (skipped the pending/confirm step). Compare created_at
        // against last_history_visit_at; if the user never visited
        // History, every Apple Pay confirmed expense counts.
        `SELECT 1 AS has_unreviewed
         FROM expenses
         WHERE user_id = ?
           AND source = 'apple-pay'
           AND status = 'confirmed'
           AND deleted = 0
           ${lastVisit ? "AND created_at > ?" : ""}
         LIMIT 1`,
      )
      .get(...(lastVisit ? [userId, lastVisit] : [userId])) as
      | { has_unreviewed: number }
      | undefined;

    return c.json({ has_unreviewed: !!row });
  })
  // POST /visit — stamp last_history_visit_at = now. Called when the History
  // tab mounts so the BottomNav dot clears.
  .post("/visit", (c) => {
    const userId = c.get("userId");
    db.prepare(
      `UPDATE users SET last_history_visit_at = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(new Date().toISOString(), userId);
    return c.json({ ok: true });
  });

export default historyMarker;
