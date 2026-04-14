import db from "./connection.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run migration first to ensure tables exist
const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Seed categories and subcategories
const seed = readFileSync(resolve(__dirname, "seed.sql"), "utf-8");
db.exec(seed);

// Resolve passwords from env, or generate random ones and log them once.
function resolvePassword(name: string, envVar: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const generated = crypto.randomUUID();
  console.log(`[seed] Generated password for ${name}: ${generated}`);
  console.log(`[seed] Set ${envVar} in .env to override on next seed.`);
  return generated;
}

function seedUser(id: string, username: string, displayName: string, color: string, envVar: string): void {
  const existing = db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (existing) {
    console.log(`[seed] User ${username} already exists — skipping password seed`);
    return;
  }
  const password = resolvePassword(displayName, envVar);
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, avatar_color)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, username, displayName, hash, color);
}

seedUser("00000000-0000-0000-0000-000000000001", "alice", "Alice", "#6c9cff", "ALICE_PASSWORD");
seedUser("00000000-0000-0000-0000-000000000002", "bob", "Bob", "#9775fa", "BOB_PASSWORD");

console.log("Seed complete.");
