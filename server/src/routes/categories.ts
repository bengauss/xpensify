import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

/**
 * better-sqlite3 throws this code when a DELETE violates a foreign-key
 * constraint (foreign_keys = ON). We translate it to a 409 so a still-referenced
 * row — including refs the explicit COUNT guards don't enumerate, e.g. a
 * soft-deleted expense or a future FK — never surfaces as an uncaught 500.
 */
function isForeignKeyError(err: unknown): boolean {
  return err instanceof Error && (err as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}

const categories = new Hono<{ Variables: Variables }>()
  // All routes require auth
  .use("/*", authMiddleware)
  // GET / — list all categories with their subcategories
  .get("/", (c) => {
    const cats = db
      .prepare(`SELECT * FROM categories ORDER BY sort_order`)
      .all() as {
        id: string;
        name: string;
        icon: string;
        color: string;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }[];

    const subs = db
      .prepare(`SELECT * FROM subcategories ORDER BY sort_order`)
      .all() as {
        id: string;
        category_id: string;
        name: string;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }[];

    const result = cats.map((cat) => ({
      ...cat,
      subcategories: subs.filter((s) => s.category_id === cat.id),
    }));

    return c.json(result);
  })
  // POST / — create category
  .post("/", async (c) => {
    let body: { name?: unknown; icon?: unknown; color?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { name, icon, color } = body;
    if (typeof name !== "string" || typeof icon !== "string" || typeof color !== "string") {
      return c.json({ error: "name, icon, and color are required" }, 400);
    }

    const maxRow = db
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories`)
      .get() as { max_order: number };
    const sort_order = maxRow.max_order + 1;

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(id, name, icon, color, sort_order);

    const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
    return c.json(cat, 201);
  })
  // PATCH /:id — update category
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    let body: { name?: unknown; icon?: unknown; color?: unknown; sort_order?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const existing = db
      .prepare(`SELECT * FROM categories WHERE id = ?`)
      .get(id) as { id: string; name: string; icon: string; color: string; sort_order: number } | undefined;

    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    const name = typeof body.name === "string" ? body.name : existing.name;
    const icon = typeof body.icon === "string" ? body.icon : existing.icon;
    const color = typeof body.color === "string" ? body.color : existing.color;
    const sort_order = typeof body.sort_order === "number" ? body.sort_order : existing.sort_order;

    db.prepare(
      `UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ?, updated_at = ? WHERE id = ?`
    ).run(name, icon, color, sort_order, new Date().toISOString(), id);

    const updated = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
    return c.json(updated);
  })
  // DELETE /:id — delete category (only if nothing references it)
  .delete("/:id", (c) => {
    const id = c.req.param("id");

    const existing = db.prepare(`SELECT id FROM categories WHERE id = ?`).get(id);
    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    const expenseCount = db
      .prepare(`SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND deleted = 0`)
      .get(id) as { count: number };

    if (expenseCount.count > 0) {
      return c.json(
        { error: `Cannot delete category: ${expenseCount.count} expense(s) still reference it` },
        409
      );
    }

    const recurringCount = db
      .prepare(`SELECT COUNT(*) as count FROM recurring_templates WHERE category_id = ?`)
      .get(id) as { count: number };

    if (recurringCount.count > 0) {
      return c.json(
        { error: `Cannot delete category: ${recurringCount.count} recurring template(s) still reference it` },
        409
      );
    }

    const merchantCount = db
      .prepare(`SELECT COUNT(*) as count FROM merchant_categories WHERE category_id = ?`)
      .get(id) as { count: number };

    if (merchantCount.count > 0) {
      return c.json(
        { error: `Cannot delete category: ${merchantCount.count} merchant mapping(s) still reference it` },
        409
      );
    }

    try {
      db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
    } catch (err) {
      if (isForeignKeyError(err)) {
        return c.json({ error: "Cannot delete category: still referenced by other records" }, 409);
      }
      throw err;
    }
    return c.json({ ok: true });
  })
  // POST /:id/subcategories — add subcategory to a category
  .post("/:id/subcategories", async (c) => {
    const categoryId = c.req.param("id");
    let body: { name?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { name } = body;
    if (typeof name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }

    const cat = db.prepare(`SELECT id FROM categories WHERE id = ?`).get(categoryId);
    if (!cat) {
      return c.json({ error: "Category not found" }, 404);
    }

    const maxRow = db
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) as max_order FROM subcategories WHERE category_id = ?`)
      .get(categoryId) as { max_order: number };
    const sort_order = maxRow.max_order + 1;

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO subcategories (id, category_id, name, sort_order) VALUES (?, ?, ?, ?)`
    ).run(id, categoryId, name, sort_order);

    const sub = db.prepare(`SELECT * FROM subcategories WHERE id = ?`).get(id);
    return c.json(sub, 201);
  })
  // PATCH /subcategories/:id — update subcategory
  .patch("/subcategories/:id", async (c) => {
    const id = c.req.param("id");
    let body: { name?: unknown; sort_order?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const existing = db
      .prepare(`SELECT * FROM subcategories WHERE id = ?`)
      .get(id) as { id: string; name: string; sort_order: number } | undefined;

    if (!existing) {
      return c.json({ error: "Subcategory not found" }, 404);
    }

    const name = typeof body.name === "string" ? body.name : existing.name;
    const sort_order = typeof body.sort_order === "number" ? body.sort_order : existing.sort_order;

    db.prepare(
      `UPDATE subcategories SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?`
    ).run(name, sort_order, new Date().toISOString(), id);

    const updated = db.prepare(`SELECT * FROM subcategories WHERE id = ?`).get(id);
    return c.json(updated);
  })
  // DELETE /subcategories/:id — delete subcategory (only if nothing references it)
  .delete("/subcategories/:id", (c) => {
    const id = c.req.param("id");

    const existing = db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get(id);
    if (!existing) {
      return c.json({ error: "Subcategory not found" }, 404);
    }

    const expenseCount = db
      .prepare(`SELECT COUNT(*) as count FROM expenses WHERE subcategory_id = ? AND deleted = 0`)
      .get(id) as { count: number };

    if (expenseCount.count > 0) {
      return c.json(
        { error: `Cannot delete subcategory: ${expenseCount.count} expense(s) still reference it` },
        409
      );
    }

    const recurringCount = db
      .prepare(`SELECT COUNT(*) as count FROM recurring_templates WHERE subcategory_id = ?`)
      .get(id) as { count: number };

    if (recurringCount.count > 0) {
      return c.json(
        { error: `Cannot delete subcategory: ${recurringCount.count} recurring template(s) still reference it` },
        409
      );
    }

    const merchantCount = db
      .prepare(`SELECT COUNT(*) as count FROM merchant_categories WHERE subcategory_id = ?`)
      .get(id) as { count: number };

    if (merchantCount.count > 0) {
      return c.json(
        { error: `Cannot delete subcategory: ${merchantCount.count} merchant mapping(s) still reference it` },
        409
      );
    }

    try {
      db.prepare(`DELETE FROM subcategories WHERE id = ?`).run(id);
    } catch (err) {
      if (isForeignKeyError(err)) {
        return c.json({ error: "Cannot delete subcategory: still referenced by other records" }, 409);
      }
      throw err;
    }
    return c.json({ ok: true });
  });

export default categories;
