import type Database from "better-sqlite3";

export function sweepExpiredSessions(db: Database.Database): void {
  const result = db
    .prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`)
    .run();
  if (result.changes > 0) {
    console.log(`[sessions] swept ${result.changes} expired session(s)`);
  }
}
