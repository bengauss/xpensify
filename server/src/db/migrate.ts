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
        auto_saved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO expenses_new
        SELECT id, user_id, category_id, subcategory_id, amount, note, tags, image_url,
               timestamp, source, recurring_template_id, deleted, status, auto_saved,
               created_at, updated_at
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

// merchant_categories was originally per-user (composite PK user_id + merchant).
// Switched to household-wide (PK = merchant_normalized only): both users
// contribute confirmations to the same row, no more re-training the system
// twice. Migration picks the row with the highest confirmation_count per
// merchant (ties broken by most recent last_confirmed_at) so we don't lose
// training when both users had memorized the same merchant.
function migrateMerchantCategoriesToShared(): void {
  const cols = db.prepare(`PRAGMA table_info(merchant_categories)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "user_id")) return;

  console.log("Rebuilding merchant_categories to drop user_id (household-shared memory)");
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE merchant_categories_new (
        merchant_normalized TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES categories(id),
        subcategory_id TEXT NOT NULL REFERENCES subcategories(id),
        confirmation_count INTEGER NOT NULL DEFAULT 1,
        last_confirmed_at TEXT NOT NULL
      );
      INSERT INTO merchant_categories_new (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
        SELECT merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at
        FROM merchant_categories m
        WHERE rowid = (
          SELECT rowid FROM merchant_categories m2
          WHERE m2.merchant_normalized = m.merchant_normalized
          ORDER BY m2.confirmation_count DESC, m2.last_confirmed_at DESC
          LIMIT 1
        );
      DROP INDEX IF EXISTS idx_merchant_categories_user;
      DROP TABLE merchant_categories;
      ALTER TABLE merchant_categories_new RENAME TO merchant_categories;
      COMMIT;
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function normalizeAllTimestamps(): void {
  const targets = [
    { table: "users", cols: ["created_at", "updated_at"] },
    { table: "sessions", cols: ["created_at"] },
    { table: "categories", cols: ["created_at", "updated_at"] },
    { table: "subcategories", cols: ["created_at", "updated_at"] },
    { table: "expenses", cols: ["timestamp", "created_at", "updated_at"] },
    { table: "recurring_templates", cols: ["created_at", "updated_at"] },
    { table: "push_subscriptions", cols: ["created_at"] },
    { table: "notification_preferences", cols: ["updated_at"] },
    { table: "merchant_aliases", cols: ["created_at"] },
    { table: "api_tokens", cols: ["created_at", "last_used_at"] },
    { table: "merchant_categories", cols: ["last_confirmed_at"] },
  ];

  db.transaction(() => {
    for (const { table, cols } of targets) {
      const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!exists) continue;

      for (const col of cols) {
        const colsInfo = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!colsInfo.some((c) => c.name === col)) continue;

        db.prepare(`
          UPDATE ${table}
          SET ${col} = replace(${col}, ' ', 'T') || '.000Z'
          WHERE ${col} LIKE '____-__-__ __:__:__'
        `).run();

        db.prepare(`
          UPDATE ${table}
          SET ${col} = ${col} || '.000Z'
          WHERE ${col} LIKE '____-__-__T__:__:__'
        `).run();
      }
    }
  })();
}

export function runMigrations(): void {
  // schema.sql lives next to this file at compile time (server/src/db) and at
  // runtime (server/dist/db, copied by the Dockerfile).
  const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);

  addColumnIfMissing("recurring_templates", "start_date", "TEXT");
  addColumnIfMissing("expenses", "status", "TEXT NOT NULL DEFAULT 'confirmed'");
  // auto_saved: 1 when the row was inserted by the Apple Pay webhook directly
  // as 'confirmed' via merchant memory ≥2 — i.e. the user never confirmed it.
  // Drives the apple marker in History so they can spot-check accuracy.
  addColumnIfMissing("expenses", "auto_saved", "INTEGER NOT NULL DEFAULT 0");
  // last_history_visit_at: per-user marker for "have I seen the History tab
  // since the last auto-saved Apple Pay expense?". The BottomNav dot reads
  // this to decide whether to show the unreviewed indicator.
  addColumnIfMissing("users", "last_history_visit_at", "TEXT");

  // Index requires the status column to exist; created here, post-add.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)`);

  relaxExpensesNullability();
  migrateMerchantCategoriesToShared();
  normalizeAllTimestamps();
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
