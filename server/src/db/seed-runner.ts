import db from "./connection.js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import yaml from "js-yaml";
import { seedCategories } from "./seed-categories.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run migration first to ensure tables exist
const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Seed categories and subcategories from YAML config
seedCategories();

// ── Users config loader ──────────────────────────────────────────────────────

interface UserConfigEntry {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

interface UsersConfig {
  users: UserConfigEntry[];
}

/**
 * Resolve the users config file. Searches `config/users.yaml` then
 * `config/users.example.yaml` in process.cwd() AND the parent dir, so it works
 * both when run from the repo root (`config/...`) and from `server/`
 * (`../config/...`). Override the path via the USERS_CONFIG env var.
 *
 * We avoid resolving relative to __dirname because in production builds
 * __dirname is inside dist/, far from the config file.
 */
function loadUsersConfig(): UsersConfig {
  const override = process.env.USERS_CONFIG;
  const candidates: string[] = [];
  if (override) {
    if (isAbsolute(override)) {
      candidates.push(override);
    } else {
      candidates.push(resolve(process.cwd(), override));
      candidates.push(resolve(process.cwd(), "..", override));
    }
  } else {
    candidates.push(resolve(process.cwd(), "config/users.yaml"));
    candidates.push(resolve(process.cwd(), "..", "config/users.yaml"));
    candidates.push(resolve(process.cwd(), "config/users.example.yaml"));
    candidates.push(resolve(process.cwd(), "..", "config/users.example.yaml"));
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf-8");
      const parsed = yaml.load(raw) as UsersConfig;
      if (!parsed || !Array.isArray(parsed.users)) {
        throw new Error(`[seed] ${path} is missing a top-level 'users:' list`);
      }
      console.log(`[seed] Loaded users config from ${path}`);
      return parsed;
    }
  }

  throw new Error(
    `[seed] No users config found. Tried: ${candidates.join(", ")}. ` +
      `Copy config/users.example.yaml to config/users.yaml or set USERS_CONFIG.`,
  );
}

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
  console.log(`[seed] Seeded user ${username} (${id})`);
}

const config = loadUsersConfig();
for (const entry of config.users) {
  const envVar = `${entry.username.toUpperCase()}_PASSWORD`;
  seedUser(entry.id, entry.username, entry.display_name, entry.avatar_color, envVar);
}

console.log("Seed complete.");
