import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import categories from "./categories.js";
import {
  db,
  ensureMigrated,
  resetDb,
  seedTestUsers,
  seedTestSession,
  sessionCookie,
  insertExpense,
  insertRecurringTemplate,
} from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let userAId: string;
let userACookie: string;
const app = mountRouter("categories", categories);

function seedMemory(merchant: string, categoryId: string, subcategoryId: string) {
  db.prepare(
    `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(merchant, categoryId, subcategoryId, 2, "2026-04-30T10:00:00Z");
}

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
  userACookie = sessionCookie(seedTestSession(userAId));
});

describe("DELETE /api/categories/:id — FK guards", () => {
  it("returns 409 when a recurring template references the category", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      frequency: "monthly",
      next_due: "2026-05-01",
    });

    const res = await app.request("/api/categories/cat-food", jsonInit("DELETE", { cookie: userACookie }));
    expect(res.status).toBe(409);
    // category row survives a rejected delete
    expect(db.prepare(`SELECT id FROM categories WHERE id = ?`).get("cat-food")).toBeTruthy();
  });

  it("returns 409 when a merchant_categories row references the category", async () => {
    seedMemory("billa", "cat-food", "sub-groceries");

    const res = await app.request("/api/categories/cat-food", jsonInit("DELETE", { cookie: userACookie }));
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM categories WHERE id = ?`).get("cat-food")).toBeTruthy();
  });

  it("still returns 409 when an expense references the category (existing guard preserved)", async () => {
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 500 });

    const res = await app.request("/api/categories/cat-food", jsonInit("DELETE", { cookie: userACookie }));
    expect(res.status).toBe(409);
  });

  it("returns 409 (not 500) when only a soft-deleted expense references the category — the FK still bites", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 500,
      deleted: 1,
    });

    const res = await app.request("/api/categories/cat-food", jsonInit("DELETE", { cookie: userACookie }));
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM categories WHERE id = ?`).get("cat-food")).toBeTruthy();
  });

  it("deletes the category (200) when nothing references it", async () => {
    const res = await app.request("/api/categories/cat-food", jsonInit("DELETE", { cookie: userACookie }));
    expect(res.status).toBe(200);
    expect(db.prepare(`SELECT id FROM categories WHERE id = ?`).get("cat-food")).toBeUndefined();
  });
});

describe("DELETE /api/categories/subcategories/:id — FK guards", () => {
  it("returns 409 when an expense references the subcategory", async () => {
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 500 });

    const res = await app.request(
      "/api/categories/subcategories/sub-groceries",
      jsonInit("DELETE", { cookie: userACookie }),
    );
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get("sub-groceries")).toBeTruthy();
  });

  it("returns 409 when a recurring template references the subcategory", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      frequency: "monthly",
      next_due: "2026-05-01",
    });

    const res = await app.request(
      "/api/categories/subcategories/sub-groceries",
      jsonInit("DELETE", { cookie: userACookie }),
    );
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get("sub-groceries")).toBeTruthy();
  });

  it("returns 409 when a merchant_categories row references the subcategory", async () => {
    seedMemory("billa", "cat-food", "sub-groceries");

    const res = await app.request(
      "/api/categories/subcategories/sub-groceries",
      jsonInit("DELETE", { cookie: userACookie }),
    );
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get("sub-groceries")).toBeTruthy();
  });

  it("returns 409 (not 500) when only a soft-deleted expense references the subcategory — the FK still bites", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-drinks",
      amount: 500,
      deleted: 1,
    });

    const res = await app.request(
      "/api/categories/subcategories/sub-drinks",
      jsonInit("DELETE", { cookie: userACookie }),
    );
    expect(res.status).toBe(409);
    expect(db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get("sub-drinks")).toBeTruthy();
  });

  it("deletes the subcategory (200) when nothing references it", async () => {
    const res = await app.request(
      "/api/categories/subcategories/sub-drinks",
      jsonInit("DELETE", { cookie: userACookie }),
    );
    expect(res.status).toBe(200);
    expect(db.prepare(`SELECT id FROM subcategories WHERE id = ?`).get("sub-drinks")).toBeUndefined();
  });
});
