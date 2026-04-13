import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

// Resolve better-sqlite3 from the server's node_modules so this script
// can be run from any working directory (e.g. the repo root).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, "../server");
const require = createRequire(pathToFileURL(resolve(serverDir, "package.json")).href);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let dryRun = false;
let csvFile: string | undefined;

for (const arg of args) {
  if (arg === "--dry-run") {
    dryRun = true;
  } else {
    csvFile = arg;
  }
}

if (!csvFile) {
  console.error("Usage: npx tsx scripts/import-csv.ts [--dry-run] <csv-file>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// DB connection (mirrors server connection logic)
// ---------------------------------------------------------------------------

const dbPath = process.env.DB_PATH || "./server/data/xpensify.db";
const dbDir = resolve(dbPath, "..");
mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// CSV parser (no external dependency)
// ---------------------------------------------------------------------------

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length === 0) return [];

  // Parse a single CSV line respecting quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main import logic
// ---------------------------------------------------------------------------

const csvPath = resolve(process.cwd(), csvFile);
let content: string;
try {
  content = readFileSync(csvPath, "utf-8");
} catch (err) {
  console.error(`Error reading file: ${csvPath}`);
  console.error(err);
  process.exit(1);
}

const rows = parseCSV(content);
console.log(`Parsed ${rows.length} rows from CSV`);

// Load lookup tables
const categoryMap = new Map<string, string>(); // name -> id
const subcategoryMap = new Map<string, string>(); // "cat_id:name" -> id
const userMap = new Map<string, string>(); // username -> id

const catRows = db.prepare(`SELECT id, name FROM categories`).all() as { id: string; name: string }[];
for (const cat of catRows) {
  categoryMap.set(cat.name.toLowerCase(), cat.id);
}

const subRows = db.prepare(`SELECT id, category_id, name FROM subcategories`).all() as {
  id: string;
  category_id: string;
  name: string;
}[];
for (const sub of subRows) {
  subcategoryMap.set(`${sub.category_id}:${sub.name.toLowerCase()}`, sub.id);
}

const userRows = db.prepare(`SELECT id, username FROM users`).all() as { id: string; username: string }[];
for (const user of userRows) {
  userMap.set(user.username.toLowerCase(), user.id);
}

// Counters
let skippedEmpty = 0;
let skippedUnknownCategory = 0;
let skippedUnknownSubcategory = 0;
let skippedUnknownUser = 0;
let imported = 0;
let wouldImport = 0;

const insertStmt = db.prepare(
  `INSERT OR REPLACE INTO expenses
     (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, deleted, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'import', 0, datetime('now'))`
);

const doImport = db.transaction(() => {
  for (const row of rows) {
    const rowId = row["id"] ?? "";

    // Skip rows where id is empty or whitespace-only
    if (!rowId.trim()) {
      skippedEmpty++;
      continue;
    }

    const timestamp = row["timestamp"] ?? "";
    const categoryName = (row["category"] ?? "").toLowerCase();
    const subcategoryName = (row["subcategory"] ?? "").toLowerCase();
    const amountRaw = row["amount in EUR"] ?? "0";
    const note = row["note"] ?? null;
    const username = (row["user"] ?? "").toLowerCase();

    // Lookup category
    const categoryId = categoryMap.get(categoryName);
    if (!categoryId) {
      if (dryRun) {
        console.warn(`  [WARN] Row ${rowId}: unrecognized category "${row["category"]}"`);
      }
      skippedUnknownCategory++;
      continue;
    }

    // Lookup subcategory
    const subcategoryId = subcategoryMap.get(`${categoryId}:${subcategoryName}`);
    if (!subcategoryId) {
      if (dryRun) {
        console.warn(`  [WARN] Row ${rowId}: unrecognized subcategory "${row["subcategory"]}" for category "${row["category"]}"`);
      }
      skippedUnknownSubcategory++;
      continue;
    }

    // Lookup user
    const userId = userMap.get(username);
    if (!userId) {
      if (dryRun) {
        console.warn(`  [WARN] Row ${rowId}: unrecognized user "${row["user"]}"`);
      }
      skippedUnknownUser++;
      continue;
    }

    // Float-to-cents conversion — Math.round is critical
    const amountCents = Math.round(parseFloat(amountRaw) * 100);

    if (dryRun) {
      console.log(
        `  [DRY-RUN] Would import: id=${rowId} date=${timestamp} category=${row["category"]} subcategory=${row["subcategory"]} amount=${amountCents}c user=${row["user"]}`
      );
      wouldImport++;
    } else {
      insertStmt.run(
        rowId,
        userId,
        categoryId,
        subcategoryId,
        amountCents,
        note || null,
        timestamp
      );
      imported++;
    }
  }
});

doImport();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n--- Import Summary ---");
console.log(`  Total rows parsed:          ${rows.length}`);
console.log(`  Skipped (empty id):         ${skippedEmpty}`);
console.log(`  Skipped (unknown category): ${skippedUnknownCategory}`);
console.log(`  Skipped (unknown subcat):   ${skippedUnknownSubcategory}`);
console.log(`  Skipped (unknown user):     ${skippedUnknownUser}`);
if (dryRun) {
  console.log(`  Would import:               ${wouldImport}`);
  console.log("\n[DRY-RUN] No changes written.");
} else {
  console.log(`  Imported:                   ${imported}`);
}

// ---------------------------------------------------------------------------
// Post-import backfill (non-dry-run only)
// ---------------------------------------------------------------------------

if (!dryRun) {
  console.log("\n--- Post-import Backfill ---");

  // Rename health -> medical
  const healthCat = db
    .prepare(`SELECT id FROM categories WHERE name = 'health'`)
    .get() as { id: string } | undefined;
  if (healthCat) {
    const result = db
      .prepare(`UPDATE categories SET name = 'medical', updated_at = datetime('now') WHERE id = ?`)
      .run(healthCat.id);
    console.log(`  Renamed category health->medical: ${result.changes} row(s) updated`);
  } else {
    console.log(`  Category 'health' not found, skipping rename to medical`);
  }

  // Rename baby -> charlie
  const babyCat = db
    .prepare(`SELECT id FROM categories WHERE name = 'baby'`)
    .get() as { id: string } | undefined;
  if (babyCat) {
    const result = db
      .prepare(`UPDATE categories SET name = 'charlie', updated_at = datetime('now') WHERE id = ?`)
      .run(babyCat.id);
    console.log(`  Renamed category baby->charlie: ${result.changes} row(s) updated`);
  } else {
    console.log(`  Category 'baby' not found, skipping rename to charlie`);
  }

  // Move insurance entries if needed:
  // If there's an 'insurance' subcategory in a non-insurance category, and an 'insurance' category exists,
  // move those expenses to the insurance category's corresponding subcategory.
  const insuranceCat = db
    .prepare(`SELECT id FROM categories WHERE name = 'insurance'`)
    .get() as { id: string } | undefined;
  if (insuranceCat) {
    // Find subcategories named 'insurance' that belong to other categories
    const foreignInsuranceSubs = db
      .prepare(`SELECT id, category_id FROM subcategories WHERE name = 'insurance' AND category_id != ?`)
      .all(insuranceCat.id) as { id: string; category_id: string }[];

    for (const sub of foreignInsuranceSubs) {
      // Find a matching subcategory in the insurance category (use 'general' or first available)
      const targetSub = db
        .prepare(`SELECT id FROM subcategories WHERE category_id = ? LIMIT 1`)
        .get(insuranceCat.id) as { id: string } | undefined;

      if (targetSub) {
        const result = db
          .prepare(
            `UPDATE expenses SET category_id = ?, subcategory_id = ?, updated_at = datetime('now')
             WHERE subcategory_id = ? AND deleted = 0`
          )
          .run(insuranceCat.id, targetSub.id, sub.id);
        console.log(
          `  Moved insurance entries from subcategory ${sub.id} to insurance category: ${result.changes} row(s) updated`
        );
      }
    }

    if (foreignInsuranceSubs.length === 0) {
      console.log(`  No insurance entries needed moving`);
    }
  } else {
    console.log(`  Category 'insurance' not found, skipping insurance move`);
  }
}
