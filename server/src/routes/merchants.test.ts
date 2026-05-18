import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import merchants from "./merchants.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, insertExpense } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let benId: string;
let yaraId: string;
let benCookie: string;
const app = mountRouter("merchants", merchants);

function seedMemory(merchant: string, categoryId: string, subcategoryId: string, count: number, when: string) {
  db.prepare(
    `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(merchant, categoryId, subcategoryId, count, when);
}

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  benId = users.alice.id;
  yaraId = users.bob.id;
  benCookie = sessionCookie(seedTestSession(benId));
});

describe("GET /api/merchants — list", () => {
  it("returns all household merchants (no per-user scoping)", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    seedMemory("spar", "cat-food", "sub-groceries", 2, "2026-04-30T10:00:00Z");

    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data).toHaveLength(2);
    const merchants = data.map((d) => d.merchant_normalized).sort();
    expect(merchants).toEqual(["billa", "spar"]);
  });

  it("includes joined category name and icon", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data[0].category_name).toBe("food");
    expect(data[0].subcategory_name).toBe("groceries");
  });

  it("orders by confirmation_count DESC, then last_confirmed_at DESC", async () => {
    seedMemory("rare", "cat-food", "sub-groceries", 1, "2026-04-30T10:00:00Z");
    seedMemory("frequent", "cat-food", "sub-groceries", 10, "2026-04-29T10:00:00Z");
    seedMemory("recent", "cat-food", "sub-groceries", 1, "2026-04-30T11:00:00Z");

    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = await res.json() as any[];
    expect(data[0].merchant_normalized).toBe("frequent");
    expect(data[1].merchant_normalized).toBe("recent");
  });

  it("includes auto_saved_count summed across the household", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 5, "2026-04-30T10:00:00Z");
    seedMemory("spar", "cat-food", "sub-groceries", 1, "2026-04-30T10:00:00Z");

    // 2 auto-saved by Alice, 1 auto-saved by Bob, 1 manually confirmed, 1 deleted.
    // The household auto-saved count is 3 (Alice's 2 + Bob's 1).
    for (let i = 0; i < 2; i++) {
      db.prepare(
        `INSERT INTO expenses (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, auto_saved, status, deleted, created_at, updated_at)
         VALUES (?, ?, 'cat-food', 'sub-groceries', 100, 'billa', '2026-04-30T10:00:00Z', 'apple-pay', 1, 'confirmed', 0, '2026-04-30T10:00:00Z', '2026-04-30T10:00:00Z')`,
      ).run(crypto.randomUUID(), benId);
    }
    db.prepare(
      `INSERT INTO expenses (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, auto_saved, status, deleted, created_at, updated_at)
       VALUES (?, ?, 'cat-food', 'sub-groceries', 100, 'billa', '2026-04-30T10:00:00Z', 'apple-pay', 1, 'confirmed', 0, '2026-04-30T10:00:00Z', '2026-04-30T10:00:00Z')`,
    ).run(crypto.randomUUID(), yaraId);
    db.prepare(
      `INSERT INTO expenses (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, auto_saved, status, deleted, created_at, updated_at)
       VALUES (?, ?, 'cat-food', 'sub-groceries', 100, 'billa', '2026-04-30T10:00:00Z', 'apple-pay', 0, 'confirmed', 0, '2026-04-30T10:00:00Z', '2026-04-30T10:00:00Z')`,
    ).run(crypto.randomUUID(), benId);
    db.prepare(
      `INSERT INTO expenses (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, auto_saved, status, deleted, created_at, updated_at)
       VALUES (?, ?, 'cat-food', 'sub-groceries', 100, 'billa', '2026-04-30T10:00:00Z', 'apple-pay', 1, 'confirmed', 1, '2026-04-30T10:00:00Z', '2026-04-30T10:00:00Z')`,
    ).run(crypto.randomUUID(), benId);

    const res = await app.request("/api/merchants", { headers: { cookie: benCookie } });
    const data = (await res.json()) as any[];
    const billa = data.find((d) => d.merchant_normalized === "billa");
    const spar = data.find((d) => d.merchant_normalized === "spar");
    expect(billa.auto_saved_count).toBe(3);
    expect(spar.auto_saved_count).toBe(0);
  });

  it("returns 401 with no session", async () => {
    const res = await app.request("/api/merchants");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/merchants/:merchant — update", () => {
  it("rewrites mapping and resets count to 1", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 7, "2026-04-30T10:00:00Z");
    const res = await app.request(
      "/api/merchants/billa",
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-household", subcategory_id: "sub-hh-other" },
      }),
    );
    expect(res.status).toBe(200);

    const row = db
      .prepare(`SELECT category_id, confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string; confirmation_count: number };
    expect(row.category_id).toBe("cat-household");
    expect(row.confirmation_count).toBe(1);
  });

  it("returns 400 for mismatched subcategory", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
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

  it("returns 400 for invalid JSON", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 1, "2026-04-30T10:00:00Z");
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
    seedMemory("billa", "cat-food", "sub-groceries", 3, "2026-04-30T10:00:00Z");
    const res = await app.request("/api/merchants/billa", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(200);

    const exists = db
      .prepare(`SELECT 1 FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get();
    expect(exists).toBeUndefined();
  });

  it("returns 404 for unknown merchant", async () => {
    const res = await app.request("/api/merchants/unknown", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/merchants/:merchant/merge — alias one merchant into another", () => {
  it("creates the alias, deletes the source memory row, rewrites untouched notes", async () => {
    seedMemory("billa dankt", "cat-food", "sub-drinks", 1, "2026-05-18T10:00:00Z");
    seedMemory("billa", "cat-food", "sub-groceries", 5, "2026-05-18T10:00:00Z");
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa dankt", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa dankt - mom's birthday", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });

    const res = await app.request(
      "/api/merchants/billa%20dankt/merge",
      jsonInit("POST", { cookie: benCookie, body: { into: "billa" } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.canonical).toBe("billa");
    expect(data.notes_updated).toBe(1);

    const alias = db
      .prepare(`SELECT canonical_normalized FROM merchant_aliases WHERE alias_normalized = 'billa dankt'`)
      .get() as { canonical_normalized: string };
    expect(alias.canonical_normalized).toBe("billa");

    const aliasMemory = db
      .prepare(`SELECT 1 FROM merchant_categories WHERE merchant_normalized = 'billa dankt'`)
      .get();
    expect(aliasMemory).toBeUndefined();

    const billaMemory = db
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { confirmation_count: number };
    expect(billaMemory.confirmation_count).toBe(5);

    const notes = db
      .prepare(`SELECT note FROM expenses WHERE source = 'apple-pay' ORDER BY note`)
      .all() as Array<{ note: string }>;
    expect(notes.map((n) => n.note)).toEqual(["billa", "billa dankt - mom's birthday"]);
  });

  it("flattens chains so the new alias points at the deepest canonical", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 5, "2026-05-18T10:00:00Z");
    // Pre-seed an existing alias billa-old → billa
    db.prepare(
      `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
       VALUES ('billa-old', 'billa', '2026-05-18T10:00:00Z')`,
    ).run();

    const res = await app.request(
      "/api/merchants/billa%20dankt/merge",
      jsonInit("POST", { cookie: benCookie, body: { into: "billa-old" } }),
    );
    expect(res.status).toBe(200);

    const row = db
      .prepare(`SELECT canonical_normalized FROM merchant_aliases WHERE alias_normalized = 'billa dankt'`)
      .get() as { canonical_normalized: string };
    expect(row.canonical_normalized).toBe("billa");
  });

  it("rewrites prior alias rows that point at the alias being collapsed", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 5, "2026-05-18T10:00:00Z");
    db.prepare(
      `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
       VALUES ('billa-old', 'billa dankt', '2026-05-18T10:00:00Z')`,
    ).run();

    await app.request(
      "/api/merchants/billa%20dankt/merge",
      jsonInit("POST", { cookie: benCookie, body: { into: "billa" } }),
    );

    const row = db
      .prepare(`SELECT canonical_normalized FROM merchant_aliases WHERE alias_normalized = 'billa-old'`)
      .get() as { canonical_normalized: string };
    expect(row.canonical_normalized).toBe("billa");
  });

  it("rejects merging a merchant into itself", async () => {
    seedMemory("billa", "cat-food", "sub-groceries", 5, "2026-05-18T10:00:00Z");
    const res = await app.request(
      "/api/merchants/billa/merge",
      jsonInit("POST", { cookie: benCookie, body: { into: "billa" } }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects when 'into' is missing", async () => {
    const res = await app.request(
      "/api/merchants/billa%20dankt/merge",
      jsonInit("POST", { cookie: benCookie, body: {} }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/merchants/aliases — list", () => {
  it("returns all alias entries", async () => {
    db.prepare(
      `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
       VALUES ('billa dankt', 'billa', '2026-05-18T10:00:00Z'),
              ('bipa dankt', 'bipa', '2026-05-18T10:00:00Z')`,
    ).run();
    const res = await app.request("/api/merchants/aliases", { headers: { cookie: benCookie } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data).toHaveLength(2);
    expect(data.map((d) => d.alias_normalized).sort()).toEqual(["billa dankt", "bipa dankt"]);
  });
});

describe("DELETE /api/merchants/aliases/:alias", () => {
  it("removes the alias", async () => {
    db.prepare(
      `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
       VALUES ('billa dankt', 'billa', '2026-05-18T10:00:00Z')`,
    ).run();
    const res = await app.request("/api/merchants/aliases/billa%20dankt", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(200);
    const exists = db
      .prepare(`SELECT 1 FROM merchant_aliases WHERE alias_normalized = 'billa dankt'`)
      .get();
    expect(exists).toBeUndefined();
  });

  it("returns 404 for unknown alias", async () => {
    const res = await app.request("/api/merchants/aliases/nope", {
      method: "DELETE",
      headers: { cookie: benCookie },
    });
    expect(res.status).toBe(404);
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
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(3);
  });

  it("aggregates across both household members' apple-pay history", async () => {
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "spar", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: yaraId, source: "apple-pay", status: "confirmed", note: "spar", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });

    const res = await app.request("/api/merchants/import", { method: "POST", headers: { cookie: benCookie } });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.inserted).toBe(1);

    const memory = db
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE merchant_normalized = 'spar'`)
      .get() as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(2);
  });

  it("never overwrites an existing merchant memory entry", async () => {
    seedMemory("billa", "cat-household", "sub-hh-other", 1, "2026-04-30T10:00:00Z");
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });
    insertExpense({ user_id: benId, source: "apple-pay", status: "confirmed", note: "billa", amount: 1000, category_id: "cat-food", subcategory_id: "sub-groceries" });

    const res = await app.request("/api/merchants/import", { method: "POST", headers: { cookie: benCookie } });
    const data = await res.json() as any;
    expect(data.inserted).toBe(0);
    expect(data.skipped).toBe(1);

    const memory = db
      .prepare(`SELECT category_id FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string };
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
      .prepare(`SELECT subcategory_id, confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { subcategory_id: string; confirmation_count: number };
    expect(memory.subcategory_id).toBe("sub-groceries");
    expect(memory.confirmation_count).toBe(3);
  });
});
