import db from "./connection.js";
import { existsSync, readFileSync } from "fs";
import { resolve, isAbsolute } from "path";
import yaml from "js-yaml";

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
      return parsed;
    }
  }

  throw new Error(
    `[seed] No categories config found. Tried: ${candidates.join(", ")}. ` +
      `Copy config/categories.example.yaml to config/categories.yaml or set CATEGORIES_CONFIG.`,
  );
}

/**
 * Upsert categories + subcategories from config/categories.yaml into the DB.
 * Idempotent — safe to call on every server boot.
 */
export function seedCategories(): void {
  const config = loadCategoriesConfig();
  const insertCategory = db.prepare(
    `INSERT INTO categories (id, name, icon, color, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       icon = excluded.icon,
       color = excluded.color,
       sort_order = excluded.sort_order`,
  );
  const insertSubcategory = db.prepare(
    `INSERT INTO subcategories (id, category_id, name, sort_order)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       name = excluded.name,
       sort_order = excluded.sort_order`,
  );

  let categoryCount = 0;
  let subcategoryCount = 0;
  const run = db.transaction(() => {
    for (const cat of config.categories) {
      insertCategory.run(cat.id, cat.name, cat.icon, cat.color, cat.sort_order);
      categoryCount++;
      for (const sub of cat.subcategories ?? []) {
        insertSubcategory.run(sub.id, cat.id, sub.name, sub.sort_order);
        subcategoryCount++;
      }
    }
  });
  run();
  console.log(`[seed] Synced ${categoryCount} categories, ${subcategoryCount} subcategories from YAML`);
}
