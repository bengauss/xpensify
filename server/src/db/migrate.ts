import db from "./connection.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added column ${table}.${column}`);
  }
}

// Apple Pay shortcut pending expenses store category_id/subcategory_id as NULL
// until confirmed. Older DBs declared those columns NOT NULL — relax them.
function relaxExpensesNullability(): void {
  const cols = db.prepare(`PRAGMA table_info(expenses)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const cat = cols.find((c) => c.name === "category_id");
  const sub = cols.find((c) => c.name === "subcategory_id");
  if (!cat || !sub) return;
  if (cat.notnull === 0 && sub.notnull === 0) return;

  console.log("Rebuilding expenses table to relax category_id/subcategory_id NOT NULL");
  // PRAGMA foreign_keys must be set OUTSIDE a transaction (sqlite refuses to
  // toggle it mid-transaction).
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE expenses_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        category_id TEXT REFERENCES categories(id),
        subcategory_id TEXT REFERENCES subcategories(id),
        amount INTEGER NOT NULL,
        note TEXT,
        tags TEXT,
        image_url TEXT,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        recurring_template_id TEXT REFERENCES recurring_templates(id),
        deleted INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO expenses_new
        SELECT id, user_id, category_id, subcategory_id, amount, note, tags, image_url,
               timestamp, source, recurring_template_id, deleted, status, created_at, updated_at
        FROM expenses;
      DROP TABLE expenses;
      ALTER TABLE expenses_new RENAME TO expenses;
      CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_updated ON expenses(updated_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
      COMMIT;
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function runMigrations(): void {
  // schema.sql lives next to this file at compile time (server/src/db) and at
  // runtime (server/dist/db, copied by the Dockerfile).
  const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);

  addColumnIfMissing("recurring_templates", "start_date", "TEXT");
  addColumnIfMissing("expenses", "status", "TEXT NOT NULL DEFAULT 'confirmed'");
  // last_history_visit_at: per-user marker for "have I seen the History tab
  // since the last auto-saved Apple Pay expense?". The BottomNav dot reads
  // this to decide whether to show the unreviewed indicator.
  addColumnIfMissing("users", "last_history_visit_at", "TEXT");

  // Index requires the status column to exist; created here, post-add.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)`);

  relaxExpensesNullability();
}

// When invoked directly via `npm run migrate`, run and log.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js");
if (isMain) {
  runMigrations();
  console.log("Migration complete.");
}
