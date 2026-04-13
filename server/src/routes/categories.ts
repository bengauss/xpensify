import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const categories = new Hono<{ Variables: Variables }>();

// All routes require auth
categories.use("/*", authMiddleware);

// GET / — list all categories with their subcategories
categories.get("/", (c) => {
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
});

// POST / — create category
categories.post("/", async (c) => {
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
});

// PATCH /:id — update category
categories.patch("/:id", async (c) => {
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
    `UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, icon, color, sort_order, id);

  const updated = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
  return c.json(updated);
});

// DELETE /:id — delete category (CASCADE handles subcategories)
categories.delete("/:id", (c) => {
  const id = c.req.param("id");

  const existing = db.prepare(`SELECT id FROM categories WHERE id = ?`).get(id);
  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

// POST /:id/subcategories — add subcategory to a category
categories.post("/:id/subcategories", async (c) => {
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
});

// PATCH /subcategories/:id — update subcategory
categories.patch("/subcategories/:id", async (c) => {
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
    `UPDATE subcategories SET name = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, sort_order, id);

  const updated = db.prepare(`SELECT * FROM subcategories WHERE id = ?`).get(id);
  return c.json(updated);
});

// DELETE /subcategories/:id — delete subcategory
categories.delete("/subcategories/:id", (c) => {
  const id = c.req.param("id");

  const existing = db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get(id);
  if (!existing) {
    return c.json({ error: "Subcategory not found" }, 404);
  }

  db.prepare(`DELETE FROM subcategories WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

export default categories;
