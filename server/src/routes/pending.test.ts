import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import pending from "./pending.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, insertExpense } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let benId: string;
let yaraId: string;
let benCookie: string;
let yaraCookie: string;
const app = mountRouter("pending", pending);

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  benId = users.alice.id;
  yaraId = users.bob.id;
  benCookie = sessionCookie(seedTestSession(benId));
  yaraCookie = sessionCookie(seedTestSession(yaraId));
});

describe("GET /api/pending — list", () => {
  it("returns only the current user's pending expenses", async () => {
    insertExpense({ user_id: benId, amount: 1000, status: "pending", note: "billa", source: "apple-pay" });
    insertExpense({ user_id: yaraId, amount: 2000, status: "pending", note: "spar", source: "apple-pay" });
    insertExpense({ user_id: benId, amount: 3000, status: "confirmed", note: "billa", source: "apple-pay" });

    const res = await app.request("/api/pending", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].amount).toBe(1000);
  });

  it("returns 401 with no auth", async () => {
    const res = await app.request("/api/pending");
    expect(res.status).toBe(401);
  });

  it("excludes soft-deleted pending expenses", async () => {
    insertExpense({ user_id: benId, amount: 1000, status: "pending", deleted: 1, source: "apple-pay" });
    const res = await app.request("/api/pending", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data).toHaveLength(0);
  });
});

describe("PATCH /api/pending/:id/confirm — first confirmation", () => {
  it("flips status to confirmed and creates merchant_categories row with count=1", async () => {
    const id = insertExpense({
      user_id: benId,
      amount: 1000,
      status: "pending",
      note: "billa",
      source: "apple-pay",
      category_id: null,
      subcategory_id: null,
    });

    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(res.status).toBe(200);

    const expense = db.prepare(`SELECT status, category_id FROM expenses WHERE id = ?`).get(id) as any;
    expect(expense.status).toBe("confirmed");
    expect(expense.category_id).toBe("cat-food");

    const memory = db
      .prepare(`SELECT confirmation_count, category_id FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { confirmation_count: number; category_id: string };
    expect(memory).toBeDefined();
    expect(memory.confirmation_count).toBe(1);
    expect(memory.category_id).toBe("cat-food");
  });
});

describe("PATCH /api/pending/:id/confirm — repeat confirmations", () => {
  it("same-category confirmation increments count to 2", async () => {
    // Already-confirmed billa expense established memory
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 1, ?)`,
    ).run(benId, "2026-04-29T00:00:00.000Z");

    const id = insertExpense({
      user_id: benId,
      amount: 1000,
      status: "pending",
      note: "billa",
      source: "apple-pay",
    });

    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(res.status).toBe(200);

    const memory = db
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(2);
  });

  it("different-category confirmation rewrites mapping and resets count to 1", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 2, ?)`,
    ).run(benId, "2026-04-29T00:00:00.000Z");

    const id = insertExpense({
      user_id: benId,
      amount: 1000,
      status: "pending",
      note: "billa",
      source: "apple-pay",
    });

    await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-household", subcategory_id: "sub-hh-other" },
      }),
    );

    const memory = db
      .prepare(`SELECT category_id, subcategory_id, confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { category_id: string; subcategory_id: string; confirmation_count: number };
    expect(memory.category_id).toBe("cat-household");
    expect(memory.subcategory_id).toBe("sub-hh-other");
    expect(memory.confirmation_count).toBe(1);
  });

  it("last_confirmed_at advances on every confirmation", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 1, '2020-01-01T00:00:00.000Z')`,
    ).run(benId);

    const id = insertExpense({
      user_id: benId,
      amount: 1000,
      status: "pending",
      note: "billa",
      source: "apple-pay",
    });

    await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );

    const memory = db
      .prepare(`SELECT last_confirmed_at FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { last_confirmed_at: string };
    expect(memory.last_confirmed_at > "2020-01-01T00:00:00.000Z").toBe(true);
  });
});

describe("PATCH /api/pending/:id/confirm — validation", () => {
  it("returns 400 for mismatched category/subcategory", async () => {
    const id = insertExpense({ user_id: benId, amount: 1000, status: "pending", note: "billa", source: "apple-pay" });
    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-rent" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing fields", async () => {
    const id = insertExpense({ user_id: benId, amount: 1000, status: "pending", note: "billa", source: "apple-pay" });
    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for someone else's pending expense", async () => {
    const id = insertExpense({ user_id: yaraId, amount: 1000, status: "pending", note: "billa", source: "apple-pay" });
    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for already-confirmed expense", async () => {
    const id = insertExpense({ user_id: benId, amount: 1000, status: "confirmed", note: "billa", source: "apple-pay", category_id: "cat-food", subcategory_id: "sub-groceries" });
    const res = await app.request(
      `/api/pending/${id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/pending/:id — skip pending", () => {
  it("hard-deletes a pending expense", async () => {
    const id = insertExpense({ user_id: benId, amount: 1000, status: "pending", source: "apple-pay" });
    const res = await app.request(`/api/pending/${id}`, {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(200);
    const exists = db.prepare(`SELECT 1 FROM expenses WHERE id = ?`).get(id);
    expect(exists).toBeUndefined();
  });

  it("returns 404 for someone else's pending", async () => {
    const id = insertExpense({ user_id: yaraId, amount: 1000, status: "pending", source: "apple-pay" });
    const res = await app.request(`/api/pending/${id}`, {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
  });

  it("does NOT delete confirmed expenses", async () => {
    const id = insertExpense({ user_id: benId, amount: 1000, status: "confirmed", category_id: "cat-food", subcategory_id: "sub-groceries" });
    const res = await app.request(`/api/pending/${id}`, {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
    const exists = db.prepare(`SELECT 1 FROM expenses WHERE id = ?`).get(id);
    expect(exists).toBeDefined();
  });
});
