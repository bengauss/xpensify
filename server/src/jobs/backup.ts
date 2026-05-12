import { mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { resolve, join, basename } from "path";
import db from "../db/connection.js";

const RETENTION_DAYS = 30;
const BACKUP_PREFIX = "xpensify-";

function dateStamp(): string {
  // YYYY-MM-DD-HHMM in UTC, sortable lexically.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`,
  ].join("-");
}

/**
 * Snapshot the live SQLite DB to BACKUP_DIR using better-sqlite3's online
 * backup API (consistent with WAL mode, no need to lock writers). Files are
 * named `xpensify-YYYY-MM-DD-HHMM.db` and old ones beyond RETENTION_DAYS
 * are pruned.
 *
 * Silent no-op when BACKUP_DIR is unset — same opt-in pattern as VAPID and
 * GEMINI_API_KEY. Errors are logged but never thrown (a failed backup must
 * not crash the server).
 */
export async function runBackup(): Promise<void> {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return;

  const absDir = resolve(dir);
  try {
    mkdirSync(absDir, { recursive: true });
  } catch (err) {
    console.error("[backup] failed to create dir:", err);
    return;
  }

  const targetPath = join(absDir, `${BACKUP_PREFIX}${dateStamp()}.db`);
  const startedAt = Date.now();

  try {
    // better-sqlite3 exposes the SQLite Online Backup API as `db.backup(path)`,
    // returning a Promise that resolves when the snapshot is complete.
    await db.backup(targetPath);
  } catch (err) {
    console.error(`[backup] snapshot to ${targetPath} failed:`, err);
    return;
  }

  let size = 0;
  try {
    size = statSync(targetPath).size;
  } catch {
    // ignore — we'll just log without a size
  }
  const ms = Date.now() - startedAt;
  console.log(
    `[backup] wrote ${basename(targetPath)} (${(size / 1024 / 1024).toFixed(2)} MiB) in ${ms}ms`,
  );

  // Prune backups older than RETENTION_DAYS. Pure mtime-based — file naming
  // is informational only; the source of truth is the file's stat.
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  try {
    for (const name of readdirSync(absDir)) {
      if (!name.startsWith(BACKUP_PREFIX) || !name.endsWith(".db")) continue;
      const full = join(absDir, name);
      try {
        const st = statSync(full);
        if (st.mtimeMs < cutoff) {
          unlinkSync(full);
          pruned++;
        }
      } catch {
        // file vanished between readdir and stat — fine, skip.
      }
    }
  } catch (err) {
    console.error("[backup] prune scan failed:", err);
  }
  if (pruned > 0) console.log(`[backup] pruned ${pruned} backup(s) older than ${RETENTION_DAYS}d`);
}
