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

// Seed users
const passwordHash = bcrypt.hashSync("<redacted>", 10);

db.prepare(
  `INSERT OR IGNORE INTO users (id, username, display_name, password_hash, avatar_color)
   VALUES (?, ?, ?, ?, ?)`
).run("00000000-0000-0000-0000-000000000001", "alice", "Alice", passwordHash, "#6c9cff");

db.prepare(
  `INSERT OR IGNORE INTO users (id, username, display_name, password_hash, avatar_color)
   VALUES (?, ?, ?, ?, ?)`
).run("00000000-0000-0000-0000-000000000002", "bob", "Bob", passwordHash, "#9775fa");

console.log("Seed complete.");
