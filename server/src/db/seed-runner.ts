import db from "./connection.js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run migration first to ensure tables exist
const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// ── Categories config loader ─────────────────────────────────────────────────

interface SubcategoryConfigEntry {
  id: string;
  name: string;
  sort_order: number;
}

interface CategoryConfigEntry {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  subcategories?: SubcategoryConfigEntry[];
}

interface CategoriesConfig {
  categories: CategoryConfigEntry[];
}

/**
 * Resolve the categories config file. Mirrors loadUsersConfig: searches
 * `config/categories.yaml` then `config/categories.example.yaml` in
 * process.cwd() AND its parent dir (so it works whether you run from the
 * repo root or from `server/`). Override the path via CATEGORIES_CONFIG.
 *
 * We avoid resolving relative to __dirname because in production builds
 * __dirname is inside dist/, far from the config file.
 */
function loadCategoriesConfig(): CategoriesConfig {
  const override = process.env.CATEGORIES_CONFIG;
  const candidates: string[] = [];
  if (override) {
    if (isAbsolute(override)) {
      candidates.push(override);
    } else {
      candidates.push(resolve(process.cwd(), override));
      candidates.push(resolve(process.cwd(), "..", override));
    }
  } else {
    candidates.push(resolve(process.cwd(), "config/categories.yaml"));
    candidates.push(resolve(process.cwd(), "..", "config/categories.yaml"));
    candidates.push(resolve(process.cwd(), "config/categories.example.yaml"));
    candidates.push(resolve(process.cwd(), "..", "config/categories.example.yaml"));
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf-8");
      const parsed = yaml.load(raw) as CategoriesConfig;
      if (!parsed || !Array.isArray(parsed.categories)) {
        throw new Error(`[seed] ${path} is missing a top-level 'categories:' list`);
      }
      console.log(`[seed] Loaded categories config from ${path}`);
      return parsed;
    }
  }

  throw new Error(
    `[seed] No categories config found. Tried: ${candidates.join(", ")}. ` +
      `Copy config/categories.example.yaml to config/categories.yaml or set CATEGORIES_CONFIG.`,
  );
}

// Seed categories and subcategories from YAML. INSERT OR REPLACE keeps the
// same idempotent semantics the old seed.sql had — re-running updates rows
// in place without orphaning expense FKs.
const categoriesConfig = loadCategoriesConfig();
const insertCategory = db.prepare(
  `INSERT OR REPLACE INTO categories (id, name, icon, color, sort_order)
   VALUES (?, ?, ?, ?, ?)`,
);
const insertSubcategory = db.prepare(
  `INSERT OR REPLACE INTO subcategories (id, category_id, name, sort_order)
   VALUES (?, ?, ?, ?)`,
);

let categoryCount = 0;
let subcategoryCount = 0;
const seedCategories = db.transaction(() => {
  for (const cat of categoriesConfig.categories) {
    insertCategory.run(cat.id, cat.name, cat.icon, cat.color, cat.sort_order);
    categoryCount++;
    for (const sub of cat.subcategories ?? []) {
      insertSubcategory.run(sub.id, cat.id, sub.name, sub.sort_order);
      subcategoryCount++;
    }
  }
});
seedCategories();
console.log(`[seed] Seeded ${categoryCount} categories, ${subcategoryCount} subcategories`);

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
