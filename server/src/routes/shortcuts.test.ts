import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import shortcuts from "./shortcuts.js";
import sync from "./sync.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, seedTestApiToken } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let benId: string;
let yaraId: string;
let benToken: string;
let yaraToken: string;
const app = mountRouter("shortcuts", shortcuts);

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  benId = users.alice.id;
  yaraId = users.bob.id;
  benToken = seedTestApiToken(benId).plainToken;
  yaraToken = seedTestApiToken(yaraId).plainToken;
});

async function postExpense(token: string | null, body: unknown) {
  return app.request(
    "/api/shortcuts/expense",
    jsonInit("POST", {
      authorization: token ? `Bearer ${token}` : undefined,
      body,
    }),
  );
}

describe("POST /api/shortcuts/expense — auth", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.request("/api/shortcuts/expense", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 10, merchant: "billa", currency: "EUR", timestamp: "2026-04-30T12:00:00Z" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with an unknown bearer token", async () => {
    const res = await postExpense("bogus-token", { amount: 10, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(401);
  });

  it("accepts ?token= query string as a fallback for Authorization", async () => {
    const res = await app.request(
      `/api/shortcuts/expense?token=${benToken}`,
      jsonInit("POST", { body: { amount: 10, merchant: "billa", currency: "EUR" } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/shortcuts/expense — validation", () => {
  it("returns 400 for non-EUR currency", async () => {
    const res = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "USD" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    const res = await postExpense(benToken, { amount: -5, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero amount", async () => {
    const res = await postExpense(benToken, { amount: 0, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for amount >= 10000", async () => {
    const res = await postExpense(benToken, { amount: 10000, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty merchant", async () => {
    const res = await postExpense(benToken, { amount: 10, merchant: "", currency: "EUR" });
    expect(res.status).toBe(400);
  });

  it("falls back to current time when timestamp is malformed", async () => {
    // Per code in shortcuts.ts: parseTimestamp returns null for bad input,
    // then the caller does `... ?? new Date().toISOString()`. So malformed
    // timestamps don't fail the request — they just default to now.
    const res = await postExpense(benToken, {
      amount: 10,
      merchant: "billa",
      currency: "EUR",
      timestamp: "not a date",
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/shortcuts/expense", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${benToken}` },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("accepts comma-decimal amounts (de-AT locale)", async () => {
    const res = await postExpense(benToken, { amount: "32,50", merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT amount FROM expenses LIMIT 1`).get() as { amount: number };
    expect(row.amount).toBe(3250);
  });
});

describe("POST /api/shortcuts/expense — Phase 1 unknown merchant", () => {
  it("creates pending expense with no category suggestion", async () => {
    const res = await postExpense(benToken, {
      amount: 10,
      merchant: "BILLA 0123 WIEN",
      currency: "EUR",
      timestamp: "2026-04-30T12:00:00Z",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("pending");
    expect(body.auto_saved).toBe(false);
    expect(body.suggested_category).toBeNull();
    expect(body.suggested_subcategory).toBeNull();

    const row = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(body.id) as any;
    expect(row.status).toBe("pending");
    expect(row.category_id).toBeNull();
    expect(row.subcategory_id).toBeNull();
    expect(row.note).toBe("billa"); // normalized
    expect(row.source).toBe("apple-pay");
    expect(row.user_id).toBe(benId);
  });

  it("stores amount as integer cents", async () => {
    const res = await postExpense(benToken, { amount: 32.5, merchant: "billa", currency: "EUR" });
    const body = await res.json() as any;
    const row = db.prepare(`SELECT amount FROM expenses WHERE id = ?`).get(body.id) as { amount: number };
    expect(row.amount).toBe(3250);
  });

  it("updates api_tokens.last_used_at on success", async () => {
    const before = db.prepare(`SELECT last_used_at FROM api_tokens`).get() as { last_used_at: string | null };
    expect(before.last_used_at).toBeNull();

    await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });

    const after = db.prepare(`SELECT last_used_at FROM api_tokens`).get() as { last_used_at: string };
    expect(after.last_used_at).not.toBeNull();
  });
});

describe("POST /api/shortcuts/expense — Phase 2 merchant memory", () => {
  function seedMemory(userId: string, merchant: string, categoryId: string, subcategoryId: string, count: number) {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, merchant, categoryId, subcategoryId, count, new Date().toISOString());
  }

  it("count=1 → pending WITH category suggestion", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 1);
    const res = await postExpense(benToken, { amount: 10, merchant: "BILLA 0123 WIEN", currency: "EUR" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("pending");
    expect(body.auto_saved).toBe(false);
    expect(body.suggested_category).toBe("food");
    expect(body.suggested_subcategory).toBe("groceries");

    const row = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(body.id) as any;
    expect(row.category_id).toBe("cat-food");
    expect(row.subcategory_id).toBe("sub-groceries");
    expect(row.status).toBe("pending");
  });

  it("count>=2 → auto-saves as confirmed with source=apple-pay", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 2);
    const res = await postExpense(benToken, { amount: 10, merchant: "BILLA 0123 WIEN", currency: "EUR" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("confirmed");
    expect(body.auto_saved).toBe(true);
    expect(body.category).toBe("food");
    expect(body.subcategory).toBe("groceries");

    const row = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(body.id) as any;
    expect(row.status).toBe("confirmed");
    expect(row.source).toBe("apple-pay");
    expect(row.category_id).toBe("cat-food");
  });

  it("threshold of 2 is exact: count=1 still pending, count=2 auto-saves", async () => {
    // First merchant with count=1 → pending
    seedMemory(benId, "shop-a", "cat-food", "sub-groceries", 1);
    const r1 = await postExpense(benToken, { amount: 10, merchant: "shop-a", currency: "EUR" });
    const b1 = await r1.json() as any;
    expect(b1.status).toBe("pending");

    // Second merchant with count=2 → auto-saved
    seedMemory(benId, "shop-b", "cat-food", "sub-groceries", 2);
    const r2 = await postExpense(benToken, { amount: 10, merchant: "shop-b", currency: "EUR" });
    const b2 = await r2.json() as any;
    expect(b2.status).toBe("confirmed");
  });

  it("merchant memory is per-user (Alice's billa doesn't affect Bob's first billa)", async () => {
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 5);

    // Bob hits Apple Pay endpoint with billa
    const res = await postExpense(yaraToken, { amount: 10, merchant: "BILLA 0123 WIEN", currency: "EUR" });
    const body = await res.json() as any;
    expect(body.status).toBe("pending");
    expect(body.auto_saved).toBe(false);
    expect(body.suggested_category).toBeNull();
  });

  it("auto-saved expense flows through next sync (it's confirmed, not pending)", async () => {
    function seedMemory(userId: string, merchant: string, categoryId: string, subcategoryId: string, count: number) {
      db.prepare(
        `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(userId, merchant, categoryId, subcategoryId, count, new Date().toISOString());
    }
    seedMemory(benId, "billa", "cat-food", "sub-groceries", 3);
    const r = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });
    const created = await r.json() as any;
    expect(created.status).toBe("confirmed");

    // Now sync as Alice
    const benCookie = sessionCookie(seedTestSession(benId));
    const syncApp = mountRouter("sync", sync);
    const syncRes = await syncApp.request(
      "/api/sync",
      jsonInit("POST", { cookie: benCookie, body: { changes: [], last_sync: null } }),
    );
    const syncData = await syncRes.json() as any;
    const found = syncData.server_changes.find((e: any) => e.id === created.id);
    expect(found).toBeDefined();
    expect(found.status).toBe("confirmed");
  });
});

describe("POST /api/shortcuts/expense — pending excluded from sync", () => {
  it("pending expense is NOT returned in sync responses", async () => {
    const r = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });
    const body = await r.json() as any;
    expect(body.status).toBe("pending");

    const benCookie = sessionCookie(seedTestSession(benId));
    const syncApp = mountRouter("sync", sync);
    const syncRes = await syncApp.request(
      "/api/sync",
      jsonInit("POST", { cookie: benCookie, body: { changes: [], last_sync: null } }),
    );
    const syncData = await syncRes.json() as any;
    expect(syncData.server_changes.find((e: any) => e.id === body.id)).toBeUndefined();
  });
});

describe("POST /api/shortcuts/expense — merchant normalization", () => {
  it("'BILLA 0123 WIEN' is stored as 'billa'", async () => {
    const r = await postExpense(benToken, { amount: 10, merchant: "BILLA 0123 WIEN", currency: "EUR" });
    const body = await r.json() as any;
    const row = db.prepare(`SELECT note FROM expenses WHERE id = ?`).get(body.id) as { note: string };
    expect(row.note).toBe("billa");
  });

  it("merchant memory hits via the normalized note", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'starbucks coffee', 'cat-food', 'sub-drinks', 5, ?)`,
    ).run(benId, new Date().toISOString());

    const r = await postExpense(benToken, { amount: 10, merchant: "Starbucks Coffee 1234", currency: "EUR" });
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.status).toBe("confirmed");
    expect(body.category).toBe("food");
    expect(body.subcategory).toBe("drinks");
  });
});

describe("GET /api/shortcuts/expense — query string variant", () => {
  it("creates pending expense via GET with query parameters", async () => {
    const url = `/api/shortcuts/expense?token=${benToken}&amount=10.50&merchant=billa&currency=EUR`;
    const res = await app.request(url, { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("pending");
    const row = db.prepare(`SELECT amount, note FROM expenses WHERE id = ?`).get(body.id) as { amount: number; note: string };
    expect(row.amount).toBe(1050);
    expect(row.note).toBe("billa");
  });
});
