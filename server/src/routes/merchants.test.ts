import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import merchants from "./merchants.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, insertExpense } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let benId: string;
let yaraId: string;
let benCookie: string;
let yaraCookie: string;
const app = mountRouter("merchants", merchants);

function seedMemory(userId: string, merchant: string, categoryId: string, subcategoryId: string, count: number, when: string) {
  db.prepare(
    `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, merchant, categoryId, subcategoryId, count, when);
}

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  benId = users.alice.id;
  yaraId = users.bob.id;
  benCookie = sessionCookie(seedTestSession(benId));
  yaraCookie = sessionCookie(seedTestSession(yaraId));
});

describe("GET /api/merchants — list", () => {
  it("returns the current user's merchants only", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    seedMemory(yaraId, "spar", "cat-food", "sub-groceries", 2, "2026-04-30T10:00:00Z");

    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].merchant_normalized).toBe("billa");
  });

  it("includes joined category name and icon", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data[0].category_name).toBe("food");
    expect(data[0].subcategory_name).toBe("groceries");
  });

  it("orders by confirmation_count DESC, then last_confirmed_at DESC", async () => {
    seedMemory(benId, "rare", "cat-food", "sub-groceries", 1, "2026-04-30T10:00:00Z");
    seedMemory(benId, "frequent", "cat-food", "sub-groceries", 10, "2026-04-29T10:00:00Z");
    seedMemory(benId, "recent", "cat-food", "sub-groceries", 1, "2026-04-30T11:00:00Z");

    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data[0].merchant_normalized).toBe("frequent");
    expect(data[1].merchant_normalized).toBe("recent");
  });

  it("returns 401 with no session", async () => {
    const res = await app.request("/api/merchants");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/merchants/:merchant — update", () => {
  it("rewrites mapping and resets count to 1", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 7, "2026-04-30T10:00:00Z");
    const res = await app.request(
      "/api/merchants/billa",
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-household", subcategory_id: "sub-hh-other" },
      }),
    );
    expect(res.status).toBe(200);

    const row = db
      .prepare(`SELECT category_id, confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { category_id: string; confirmation_count: number };
    expect(row.category_id).toBe("cat-household");
    expect(row.confirmation_count).toBe(1);
  });

  it("returns 400 for mismatched subcategory", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request(
      "/api/merchants/billa",
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-rent" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown merchant", async () => {
    const res = await app.request(
      "/api/merchants/unknown-merchant",
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when patching another user's merchant (no leak)", async () => {
    seedMemory(yaraId, "spar", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request(
      "/api/merchants/spar",
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-household", subcategory_id: "sub-hh-other" },
      }),
    );
    expect(res.status).toBe(404);
    // Bob's mapping unchanged
    const row = db
      .prepare(`SELECT category_id FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'spar'`)
      .get(yaraId) as { category_id: string };
    expect(row.category_id).toBe("cat-food");
  });

  it("returns 400 for invalid JSON", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 1, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants/billa", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: benCookie },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/merchants/:merchant", () => {
  it("removes the mapping", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants/billa", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(200);

    const exists = db
      .prepare(`SELECT 1 FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId);
    expect(exists).toBeUndefined();
  });

  it("returns 404 for unknown merchant", async () => {
    const res = await app.request("/api/merchants/unknown", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
  });

  it("does not delete other users' merchants", async () => {
    seedMemory(yaraId, "billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants/billa", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
    const stillThere = db
      .prepare(`SELECT 1 FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(yaraId);
    expect(stillThere).toBeDefined();
  });
});

describe("POST /api/merchants/import — backfill", () => {
  it("groups confirmed apple-pay expenses by note and inserts memory rows", async () => {
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });

    const res = await app.request("/api/merchants/import", { method: "POST", headers: { cookie: benCookie } });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.inserted).toBe(1);
    expect(data.skipped).toBe(0);

    const memory = db
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(3);
  });

  it("never overwrites an existing merchant memory entry", async () => {
    seedMemory(benId, "billa", "cat-household", "sub-hh-other", 1, "2026-04-30T10:00:00Z");
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });

    const res = await app.request("/api/merchants/import", { method: "POST", headers: { cookie: benCookie } });
    const data = await res.json() as any;
    expect(data.inserted).toBe(0);
    expect(data.skipped).toBe(1);

    const memory = db
      .prepare(`SELECT category_id FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { category_id: string };
    expect(memory.category_id).toBe("cat-household");
  });

  it("picks the most-frequent (cat, sub) pair when a merchant has mixed history", async () => {
    // 3 grocery, 1 drinks — should pick grocery
    for (let i = 0; i < 3; i++) {
      insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    }
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-drinks" });

    await app.request("/api/merchants/import", { method: "POST", headers: { cookie: benCookie } });

    const memory = db
      .prepare(`SELECT subcategory_id, confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = 'billa'`)
      .get(benId) as { subcategory_id: string; confirmation_count: number };
    expect(memory.subcategory_id).toBe("sub-groceries");
    expect(memory.confirmation_count).toBe(3);
  });
});
