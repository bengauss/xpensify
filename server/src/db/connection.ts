import Database, { type Database as DatabaseType } from "better-sqlite3";
import { resolve } from "path";
import { mkdirSync } from "fs";

const dbPath = process.env.DB_PATH || "./data/xpensify.db";
const dir = resolve(dbPath, "..");
mkdirSync(dir, { recursive: true });

const db: DatabaseType = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;
