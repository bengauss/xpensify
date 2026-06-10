import { describe, it, expect, beforeEach } from "vitest";
import db from "./connection.js";
import {
  relaxExpensesNullability,
  migrateMerchantCategoriesToShared,
} from "./migrate.js";

// These two migrations rebuild a table via INSERT…SELECT…DROP…RENAME with
// foreign_keys toggled off — the most dangerous operations in the repo. They
// guard on the *current* table shape and early-return when it already matches,
// which is exactly the shape schema.sql ships. So against the test/prod schema
// the rebuild branch runs ZERO times; it only ever fires on a live legacy
// upgrade, where a dropped index, reordered column, or lost row is
// unrecoverable. These tests hand-build the legacy DDL so the rebuild actually
// executes, then assert it preserves the data.

/** Drop everything this file touches and rebuild the stable parent tables. */
function freshParents(): void {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    DROP TABLE IF EXISTS expenses;
    DROP TABLE IF EXISTS merchant_categories;
    DROP TABLE IF EXISTS recurring_templates;
    DROP TABLE IF EXISTS subcategories;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#6c9cff'
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE subcategories (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE recurring_templates (
      id TEXT PRIMARY KEY
    );

    INSERT INTO users (id, username, display_name, password_hash) VALUES
      ('u-a', 'alice', 'Alice', 'x'),
      ('u-b', 'bob', 'Bob', 'x');
    INSERT INTO categories (id, name, icon, color) VALUES
      ('c1', 'Cat One', 'i', '#111'),
      ('c2', 'Cat Two', 'i', '#222');
    INSERT INTO subcategories (id, category_id, name) VALUES
      ('s1', 'c1', 'Sub One'),
      ('s2', 'c2', 'Sub Two');
  `);
  db.pragma("foreign_keys = ON");
}

describe("relaxExpensesNullability — legacy expenses rebuild", () => {
  // Columns in the exact order the rebuilt expenses_new table declares them,
  // so we can detect a column reorder, not just a value loss.
  const EXPENSES_COLUMNS = [
    "id",
    "user_id",
    "category_id",
    "subcategory_id",
    "amount",
    "note",
    "tags",
    "image_url",
    "timestamp",
    "source",
    "recurring_template_id",
    "deleted",
    "status",
    "auto_saved",
    "created_at",
    "updated_at",
  ];

  beforeEach(() => {
    freshParents();
    // Legacy expenses: category_id / subcategory_id declared NOT NULL — the
    // pre-Apple-Pay shape the rebuild exists to relax. Every other column
    // matches schema.sql so the SELECT in the rebuild can round-trip it.
    db.exec(`
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        subcategory_id TEXT NOT NULL REFERENCES subcategories(id),
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
      CREATE INDEX idx_expenses_timestamp ON expenses(timestamp);
      CREATE INDEX idx_expenses_category ON expenses(category_id);
      CREATE INDEX idx_expenses_user ON expenses(user_id);
      CREATE INDEX idx_expenses_updated ON expenses(updated_at);
    `);

    // Representative rows: a plain manual expense, a soft-deleted one, an
    // auto-saved Apple Pay one — spanning every nullable column both NULL and set.
    const insert = db.prepare(`
      INSERT INTO expenses
        (id, user_id, category_id, subcategory_id, amount, note, tags, image_url,
         timestamp, source, recurring_template_id, deleted, status, auto_saved,
         created_at, updated_at)
      VALUES (@id, @user_id, @category_id, @subcategory_id, @amount, @note, @tags,
              @image_url, @timestamp, @source, @recurring_template_id, @deleted,
              @status, @auto_saved, @created_at, @updated_at)
    `);
    insert.run({
      id: "e1", user_id: "u-a", category_id: "c1", subcategory_id: "s1",
      amount: 1299, note: "groceries", tags: null, image_url: null,
      timestamp: "2026-03-01T09:00:00.000Z", source: "manual",
      recurring_template_id: null, deleted: 0, status: "confirmed", auto_saved: 0,
      created_at: "2026-03-01T09:00:00.000Z", updated_at: "2026-03-01T09:00:00.000Z",
    });
    insert.run({
      id: "e2", user_id: "u-b", category_id: "c2", subcategory_id: "s2",
      amount: 5000, note: null, tags: "tag-a,tag-b", image_url: "http://x/y.png",
      timestamp: "2026-03-02T10:30:00.000Z", source: "apple-pay",
      recurring_template_id: null, deleted: 1, status: "confirmed", auto_saved: 1,
      created_at: "2026-03-02T10:30:00.000Z", updated_at: "2026-03-02T11:00:00.000Z",
    });
    insert.run({
      id: "e3", user_id: "u-a", category_id: "c1", subcategory_id: "s1",
      amount: 75, note: "coffee", tags: null, image_url: null,
      timestamp: "2026-03-03T08:15:00.000Z", source: "manual",
      recurring_template_id: null, deleted: 0, status: "confirmed", auto_saved: 0,
      created_at: "2026-03-03T08:15:00.000Z", updated_at: "2026-03-03T08:15:00.000Z",
    });
  });

  it("starts from a legacy NOT NULL shape (guard precondition)", () => {
    const cols = db.prepare(`PRAGMA table_info(expenses)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(cols.find((c) => c.name === "category_id")?.notnull).toBe(1);
    expect(cols.find((c) => c.name === "subcategory_id")?.notnull).toBe(1);
  });

  it("preserves row count and every column value across the rebuild", () => {
    const before = db
      .prepare(`SELECT * FROM expenses ORDER BY id`)
      .all();

    relaxExpensesNullability();

    const after = db.prepare(`SELECT * FROM expenses ORDER BY id`).all();
    expect(after).toHaveLength(3);
    // Deep equality catches dropped rows, lost column values, and silent
    // truncation in the INSERT…SELECT.
    expect(after).toEqual(before);
  });

  it("flips category_id / subcategory_id to NULLABLE", () => {
    relaxExpensesNullability();

    const cols = db.prepare(`PRAGMA table_info(expenses)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(cols.find((c) => c.name === "category_id")?.notnull).toBe(0);
    expect(cols.find((c) => c.name === "subcategory_id")?.notnull).toBe(0);
    // Columns that must STAY NOT NULL are not loosened by accident.
    expect(cols.find((c) => c.name === "user_id")?.notnull).toBe(1);
    expect(cols.find((c) => c.name === "amount")?.notnull).toBe(1);

    // The relaxed shape is actually usable: a pending row with no category inserts.
    expect(() =>
      db
        .prepare(
          `INSERT INTO expenses (id, user_id, amount, timestamp, status)
           VALUES ('pending-1', 'u-a', 200, '2026-03-04T00:00:00.000Z', 'pending')`,
        )
        .run(),
    ).not.toThrow();
  });

  it("keeps column order stable (no reorder)", () => {
    relaxExpensesNullability();
    const names = (
      db.prepare(`PRAGMA table_info(expenses)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(names).toEqual(EXPENSES_COLUMNS);
  });

  it("recreates all expenses indexes (including idx_expenses_status)", () => {
    relaxExpensesNullability();
    const indexes = (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='expenses'`,
        )
        .all() as Array<{ name: string }>
    ).map((i) => i.name);
    for (const expected of [
      "idx_expenses_timestamp",
      "idx_expenses_category",
      "idx_expenses_user",
      "idx_expenses_updated",
      "idx_expenses_status",
    ]) {
      expect(indexes).toContain(expected);
    }
  });
});

describe("migrateMerchantCategoriesToShared — legacy per-user rebuild", () => {
  beforeEach(() => {
    freshParents();
    // Legacy merchant_categories: per-user composite PK + the user index that
    // the rebuild must drop.
    db.exec(`
      CREATE TABLE merchant_categories (
        user_id TEXT NOT NULL REFERENCES users(id),
        merchant_normalized TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id),
        subcategory_id TEXT NOT NULL REFERENCES subcategories(id),
        confirmation_count INTEGER NOT NULL DEFAULT 1,
        last_confirmed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, merchant_normalized)
      );
      CREATE INDEX idx_merchant_categories_user ON merchant_categories(user_id);
    `);
    const insert = db.prepare(`
      INSERT INTO merchant_categories
        (user_id, merchant_normalized, category_id, subcategory_id,
         confirmation_count, last_confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // spar: both users trained it. userA's higher count must win even though
    // userB's row is more recent — count beats recency.
    insert.run("u-a", "spar", "c1", "s1", 5, "2026-01-01T00:00:00.000Z");
    insert.run("u-b", "spar", "c2", "s2", 2, "2026-03-01T00:00:00.000Z");
    // billa: equal counts → tie broken by most recent last_confirmed_at (userB).
    insert.run("u-a", "billa", "c1", "s1", 3, "2026-01-01T00:00:00.000Z");
    insert.run("u-b", "billa", "c2", "s2", 3, "2026-02-01T00:00:00.000Z");
    // hofer: only one user — must survive untouched.
    insert.run("u-a", "hofer", "c1", "s1", 1, "2026-01-15T00:00:00.000Z");
  });

  it("starts from the legacy per-user shape (guard precondition)", () => {
    const cols = (
      db.prepare(`PRAGMA table_info(merchant_categories)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(cols).toContain("user_id");
  });

  it("collapses to one row per merchant and drops user_id", () => {
    migrateMerchantCategoriesToShared();

    const cols = (
      db.prepare(`PRAGMA table_info(merchant_categories)`).all() as Array<{
        name: string;
        pk: number;
      }>
    );
    expect(cols.some((c) => c.name === "user_id")).toBe(false);
    expect(cols.find((c) => c.name === "merchant_normalized")?.pk).toBe(1);

    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM merchant_categories`)
      .get() as { n: number };
    expect(count.n).toBe(3);
  });

  it("keeps the highest confirmation_count row per merchant (count beats recency)", () => {
    migrateMerchantCategoriesToShared();
    const spar = db
      .prepare(`SELECT * FROM merchant_categories WHERE merchant_normalized = 'spar'`)
      .get() as { category_id: string; subcategory_id: string; confirmation_count: number };
    expect(spar.confirmation_count).toBe(5);
    expect(spar.category_id).toBe("c1");
    expect(spar.subcategory_id).toBe("s1");
  });

  it("breaks confirmation_count ties by most recent last_confirmed_at", () => {
    migrateMerchantCategoriesToShared();
    const billa = db
      .prepare(`SELECT * FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string; subcategory_id: string; last_confirmed_at: string };
    expect(billa.category_id).toBe("c2");
    expect(billa.subcategory_id).toBe("s2");
    expect(billa.last_confirmed_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("preserves a merchant trained by only one user", () => {
    migrateMerchantCategoriesToShared();
    const hofer = db
      .prepare(`SELECT * FROM merchant_categories WHERE merchant_normalized = 'hofer'`)
      .get() as { category_id: string; confirmation_count: number } | undefined;
    expect(hofer).toBeDefined();
    expect(hofer?.confirmation_count).toBe(1);
  });

  it("drops the per-user index", () => {
    migrateMerchantCategoriesToShared();
    const idx = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_merchant_categories_user'`,
      )
      .get();
    expect(idx).toBeUndefined();
  });
});
