import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import db from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let migrated = false;

/**
 * Initialize schema + categories on first call. Subsequent calls are no-ops
 * because schema.sql is idempotent. Tests should call this from a top-level
 * beforeAll, then resetDb() in beforeEach.
 */
export function ensureMigrated(): void {
  if (migrated) return;
  runMigrations();
  const seedSql = readFileSync(resolve(__dirname, "../db/seed.sql"), "utf-8");
  db.exec(seedSql);
  migrated = true;
}

/**
 * Truncate every mutable table and re-seed categories/subcategories. Safe to
 * call between tests. Categories are cheap to reseed since they're a fixed
 * static list.
 */
export function resetDb(): void {
  ensureMigrated();
  db.exec(`
    DELETE FROM merchant_categories;
    DELETE FROM api_tokens;
    DELETE FROM push_subscriptions;
    DELETE FROM notification_preferences;
    DELETE FROM expenses;
    DELETE FROM recurring_templates;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM subcategories;
    DELETE FROM categories;
  `);
  const seedSql = readFileSync(resolve(__dirname, "../db/seed.sql"), "utf-8");
  db.exec(seedSql);
}

export interface TestUser {
  id: string;
  username: string;
  password: string;
  hash: string;
}

const USER_A_ID = "00000000-0000-0000-0000-000000000001";
const USER_B_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Insert Alice + Bob with known plaintext passwords. Returns both records so
 * tests can log in or look up IDs.
 */
export function seedTestUsers(): { alice: TestUser; bob: TestUser } {
  const benPassword = "alice-test-password-1";
  const yaraPassword = "bob-test-password-1";
  // Cost 4 keeps test runs fast (real prod uses 12). Bcrypt at 12 adds ~250ms
  // per hash which adds up fast across dozens of tests.
  const benHash = bcrypt.hashSync(benPassword, 4);
  const yaraHash = bcrypt.hashSync(yaraPassword, 4);

  const stmt = db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, avatar_color)
     VALUES (?, ?, ?, ?, ?)`,
  );
  stmt.run(USER_A_ID, "alice", "Alice", benHash, "#6c9cff");
  stmt.run(USER_B_ID, "bob", "Bob", yaraHash, "#9775fa");

  return {
    alice: { id: USER_A_ID, username: "alice", password: benPassword, hash: benHash },
    bob: { id: USER_B_ID, username: "bob", password: yaraPassword, hash: yaraHash },
  };
}

/** Create a session row directly (skips bcrypt). Returns the cookie value. */
export function seedTestSession(userId: string, expiresAtIso?: string): string {
  const sessionId = crypto.randomUUID();
  const expires = expiresAtIso ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
  ).run(sessionId, userId, expires);
  return sessionId;
}

export function sessionCookie(sessionId: string): string {
  return `xpensify_session=${sessionId}`;
}

/**
 * Create an api_token row. Returns the plain bearer token (only knowable at
 * creation time — production tokens are hashed-only after the first response).
 */
export function seedTestApiToken(userId: string, name = "test-token"): {
  id: string;
  plainToken: string;
  hash: string;
} {
  const id = crypto.randomUUID();
  const plain = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(plain).digest("hex");
  db.prepare(
    `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, hash, name, new Date().toISOString());
  return { id, plainToken: plain, hash };
}

/** Convenience: insert a confirmed expense row directly. */
export function insertExpense(row: {
  id?: string;
  user_id: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  amount: number;
  note?: string | null;
  timestamp?: string;
  source?: string;
  status?: "pending" | "confirmed";
  deleted?: number;
  recurring_template_id?: string | null;
  updated_at?: string;
}): string {
  const id = row.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO expenses
       (id, user_id, category_id, subcategory_id, amount, note, timestamp,
        source, recurring_template_id, deleted, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.user_id,
    row.category_id ?? null,
    row.subcategory_id ?? null,
    row.amount,
    row.note ?? null,
    row.timestamp ?? now,
    row.source ?? "manual",
    row.recurring_template_id ?? null,
    row.deleted ?? 0,
    row.status ?? "confirmed",
    now,
    row.updated_at ?? now,
  );
  return id;
}

export function insertRecurringTemplate(row: {
  id?: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note?: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  day_of_month?: number | null;
  start_date?: string | null;
  active?: number;
  next_due: string;
}): string {
  const id = row.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO recurring_templates
       (id, user_id, category_id, subcategory_id, amount, note, frequency,
        day_of_month, start_date, active, next_due)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.user_id,
    row.category_id,
    row.subcategory_id,
    row.amount,
    row.note ?? null,
    row.frequency,
    row.day_of_month ?? null,
    row.start_date ?? null,
    row.active ?? 1,
    row.next_due,
  );
  return id;
}

export { db };
