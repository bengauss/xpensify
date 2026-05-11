import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import shortcuts from "./shortcuts.js";
import sync from "./sync.js";
import pending from "./pending.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, seedTestApiToken } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

// Mock the Gemini Flash categorizer. Each test overrides the mock to simulate
// success, low-confidence, or failure. isFlashEnabled returns true so the
// post-insert worker actually invokes categorizeWithFlash.
const flashMock = vi.hoisted(() => ({
  enabled: true,
  result: null as
    | null
    | { category_id: string; subcategory_id: string; confidence: "low" | "medium" | "high" }
    | { __throw: string },
}));
vi.mock("../lib/flashCategorize.js", () => ({
  isFlashEnabled: () => flashMock.enabled,
  categorizeWithFlash: vi.fn(async () => {
    if (flashMock.result && "__throw" in flashMock.result) {
      throw new Error(flashMock.result.__throw);
    }
    return flashMock.result as
      | null
      | { category_id: string; subcategory_id: string; confidence: "low" | "medium" | "high" };
  }),
}));

/** Drain queueMicrotask + the await chain inside runPostInsertWork. */
async function flushPostInsertWork() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
}

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
  // Default: Flash returns null (no suggestion). Tests override per scenario.
  flashMock.enabled = true;
  flashMock.result = null;
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

  it("accepts amounts whose float representation has FP drift (e.g. 18.40)", async () => {
    // 18.40 * 100 = 1839.9999999999998 in IEEE 754 — the strict equality
    // form of the precision check rejects this. The tolerant form accepts
    // it and rounds to 1840 cents.
    const res = await postExpense(benToken, { amount: 18.4, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const row = db.prepare(`SELECT amount FROM expenses WHERE id = ?`).get(body.id) as { amount: number };
    expect(row.amount).toBe(1840);
  });

  it("still rejects amounts with truly-more-than-2-decimals (e.g. 12.345)", async () => {
    const res = await postExpense(benToken, { amount: 12.345, merchant: "billa", currency: "EUR" });
    expect(res.status).toBe(400);
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

describe("POST /api/shortcuts/expense — idempotency", () => {
  it("retried request with same (amount, merchant, timestamp) returns the existing id, no duplicate row", async () => {
    const tx = { amount: 12.5, merchant: "billa", currency: "EUR", timestamp: "2026-04-30T12:00:00Z" };
    const r1 = await postExpense(benToken, tx);
    const b1 = await r1.json() as any;

    const r2 = await postExpense(benToken, tx);
    const b2 = await r2.json() as any;

    expect(r2.status).toBe(200);
    expect(b2.id).toBe(b1.id);
    expect(b2.deduped).toBe(true);

    const count = db.prepare(`SELECT COUNT(*) as c FROM expenses WHERE note = 'billa'`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("two real twin transactions (different timestamps) are not deduped", async () => {
    const r1 = await postExpense(benToken, { amount: 4.5, merchant: "spar", currency: "EUR", timestamp: "2026-04-30T10:00:00Z" });
    const r2 = await postExpense(benToken, { amount: 4.5, merchant: "spar", currency: "EUR", timestamp: "2026-04-30T10:00:01Z" });
    const b1 = await r1.json() as any;
    const b2 = await r2.json() as any;
    expect(b1.id).not.toBe(b2.id);

    const count = db.prepare(`SELECT COUNT(*) as c FROM expenses WHERE note = 'spar'`).get() as { c: number };
    expect(count.c).toBe(2);
  });

  it("dedupe is per-user (Bob's identical tx is not a dupe of Alice's)", async () => {
    const tx = { amount: 7, merchant: "lidl", currency: "EUR", timestamp: "2026-04-30T08:00:00Z" };
    await postExpense(benToken, tx);
    const r2 = await postExpense(yaraToken, tx);
    const b2 = await r2.json() as any;
    expect(b2.deduped).toBeUndefined();

    const count = db.prepare(`SELECT COUNT(*) as c FROM expenses WHERE note = 'lidl'`).get() as { c: number };
    expect(count.c).toBe(2);
  });
});

describe("POST /api/shortcuts/expense — auto_saved column", () => {
  it("auto-saved row has auto_saved=1 (memory ≥ 2 path)", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 3, ?)`,
    ).run(benId, new Date().toISOString());
    const r = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });
    const body = await r.json() as any;
    expect(body.status).toBe("confirmed");
    const row = db.prepare(`SELECT auto_saved FROM expenses WHERE id = ?`).get(body.id) as { auto_saved: number };
    expect(row.auto_saved).toBe(1);
  });

  it("memory pre-fill row has auto_saved=0", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 1, ?)`,
    ).run(benId, new Date().toISOString());
    const r = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });
    const body = await r.json() as any;
    expect(body.status).toBe("pending");
    const row = db.prepare(`SELECT auto_saved FROM expenses WHERE id = ?`).get(body.id) as { auto_saved: number };
    expect(row.auto_saved).toBe(0);
  });

  it("no-memory pending row has auto_saved=0", async () => {
    const r = await postExpense(benToken, { amount: 10, merchant: "newmerchant", currency: "EUR" });
    const body = await r.json() as any;
    expect(body.status).toBe("pending");
    const row = db.prepare(`SELECT auto_saved FROM expenses WHERE id = ?`).get(body.id) as { auto_saved: number };
    expect(row.auto_saved).toBe(0);
  });
});

describe("POST /api/shortcuts/expense — Gemini Flash background fill", () => {
  it("medium-confidence Flash result fills the pending row's category", async () => {
    flashMock.result = {
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      confidence: "medium",
    };

    const r = await postExpense(benToken, { amount: 10, merchant: "newmerchant", currency: "EUR" });
    const body = await r.json() as any;
    // Webhook responds before Flash runs — initial response shows no suggestion.
    expect(body.status).toBe("pending");
    expect(body.suggested_category).toBeNull();

    await flushPostInsertWork();

    const row = db.prepare(
      `SELECT category_id, subcategory_id, status FROM expenses WHERE id = ?`,
    ).get(body.id) as { category_id: string; subcategory_id: string; status: string };
    expect(row.category_id).toBe("cat-food");
    expect(row.subcategory_id).toBe("sub-groceries");
    expect(row.status).toBe("pending");
  });

  it("null Flash result (low confidence / failure) leaves the row uncategorized", async () => {
    flashMock.result = null;
    const r = await postExpense(benToken, { amount: 10, merchant: "obscuremerchant", currency: "EUR" });
    const body = await r.json() as any;
    await flushPostInsertWork();
    const row = db.prepare(
      `SELECT category_id, subcategory_id FROM expenses WHERE id = ?`,
    ).get(body.id) as { category_id: string | null; subcategory_id: string | null };
    expect(row.category_id).toBeNull();
    expect(row.subcategory_id).toBeNull();
  });

  it("Flash exception (treated as null) does not crash and leaves row pending", async () => {
    flashMock.result = { __throw: "boom" };
    const r = await postExpense(benToken, { amount: 10, merchant: "crashy", currency: "EUR" });
    const body = await r.json() as any;
    await flushPostInsertWork();
    const row = db.prepare(
      `SELECT category_id, status FROM expenses WHERE id = ?`,
    ).get(body.id) as { category_id: string | null; status: string };
    expect(row.category_id).toBeNull();
    expect(row.status).toBe("pending");
  });

  it("Flash does NOT run when memory exists (count=1 path)", async () => {
    db.prepare(
      `INSERT INTO merchant_categories (user_id, merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES (?, 'billa', 'cat-food', 'sub-groceries', 1, ?)`,
    ).run(benId, new Date().toISOString());
    flashMock.result = {
      category_id: "cat-apparel", // would be wrong but Flash shouldn't be called
      subcategory_id: "sub-clothes",
      confidence: "high",
    };

    const r = await postExpense(benToken, { amount: 10, merchant: "billa", currency: "EUR" });
    const body = await r.json() as any;
    await flushPostInsertWork();

    const row = db.prepare(
      `SELECT category_id FROM expenses WHERE id = ?`,
    ).get(body.id) as { category_id: string };
    // Memory's value wins; Flash mock's value is ignored.
    expect(row.category_id).toBe("cat-food");
  });

  it("Flash does NOT run when GEMINI_API_KEY is absent (isFlashEnabled=false)", async () => {
    flashMock.enabled = false;
    flashMock.result = {
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      confidence: "high",
    };
    const r = await postExpense(benToken, { amount: 10, merchant: "newmerchant", currency: "EUR" });
    const body = await r.json() as any;
    await flushPostInsertWork();
    const row = db.prepare(`SELECT category_id FROM expenses WHERE id = ?`).get(body.id) as { category_id: string | null };
    expect(row.category_id).toBeNull();
  });

  it("Flash UPDATE is idempotent: doesn't overwrite a manually-confirmed category", async () => {
    // Slow Flash mock so we can manually confirm the row mid-flight.
    let resolveFlash!: (v: { category_id: string; subcategory_id: string; confidence: "high" }) => void;
    const slowFlash = new Promise<{ category_id: string; subcategory_id: string; confidence: "high" }>((resolve) => {
      resolveFlash = resolve;
    });

    const flashModule = await import("../lib/flashCategorize.js");
    const orig = flashModule.categorizeWithFlash;
    (flashModule.categorizeWithFlash as any) = vi.fn(async () => slowFlash);

    try {
      const r = await postExpense(benToken, { amount: 10, merchant: "racemerchant", currency: "EUR" });
      const body = await r.json() as any;

      // Manually confirm the row (as if user opened Confirm before Flash returned).
      db.prepare(
        `UPDATE expenses SET category_id = 'cat-apparel', subcategory_id = 'sub-clothes', status = 'confirmed' WHERE id = ?`,
      ).run(body.id);

      // Now let Flash complete with its (different) suggestion.
      resolveFlash({ category_id: "cat-food", subcategory_id: "sub-groceries", confidence: "high" });
      await flushPostInsertWork();

      const row = db.prepare(`SELECT category_id, status FROM expenses WHERE id = ?`).get(body.id) as { category_id: string; status: string };
      // The user's manual choice is preserved; Flash's late update is dropped.
      expect(row.category_id).toBe("cat-apparel");
      expect(row.status).toBe("confirmed");
    } finally {
      (flashModule.categorizeWithFlash as any) = orig;
    }
  });
});

describe("PATCH /api/pending/:id/confirm — Flash-accepted bumps memory to count=2", () => {
  it("user accepts Flash suggestion (no prior memory) → merchant_categories inserted at count=2", async () => {
    flashMock.result = {
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      confidence: "high",
    };

    // Apple Pay hits → Flash fills the pending row.
    const r = await postExpense(benToken, { amount: 10, merchant: "newmerchant", currency: "EUR" });
    const created = await r.json() as any;
    await flushPostInsertWork();

    // User confirms with the same (cat, sub) Flash suggested.
    const benCookie = sessionCookie(seedTestSession(benId));
    const pendingApp = mountRouter("pending", pending);
    const confirmRes = await pendingApp.request(
      `/api/pending/${created.id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-food", subcategory_id: "sub-groceries" },
      }),
    );
    expect(confirmRes.status).toBe(200);

    // Memory inserted at count=2 → next hit auto-saves.
    const memory = db.prepare(
      `SELECT confirmation_count FROM merchant_categories WHERE user_id = ? AND merchant_normalized = ?`,
    ).get(benId, "newmerchant") as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(2);

    // Verify: a second hit on the same merchant auto-saves (count >= 2 path).
    const r2 = await postExpense(benToken, { amount: 5, merchant: "newmerchant", currency: "EUR" });
    const body2 = await r2.json() as any;
    expect(body2.status).toBe("confirmed");
    expect(body2.auto_saved).toBe(true);
  });

  it("user changes Flash suggestion → memory inserted at count=1 (Flash was wrong)", async () => {
    flashMock.result = {
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      confidence: "high",
    };

    const r = await postExpense(benToken, { amount: 10, merchant: "newmerchant", currency: "EUR" });
    const created = await r.json() as any;
    await flushPostInsertWork();

    // User confirms with a DIFFERENT category than Flash suggested.
    const benCookie = sessionCookie(seedTestSession(benId));
    const pendingApp = mountRouter("pending", pending);
    await pendingApp.request(
      `/api/pending/${created.id}/confirm`,
      jsonInit("PATCH", {
        cookie: benCookie,
        body: { category_id: "cat-apparel", subcategory_id: "sub-clothes" },
      }),
    );

    const memory = db.prepare(
      `SELECT confirmation_count, category_id FROM merchant_categories WHERE user_id = ? AND merchant_normalized = ?`,
    ).get(benId, "newmerchant") as { confirmation_count: number; category_id: string };
    expect(memory.confirmation_count).toBe(1);
    expect(memory.category_id).toBe("cat-apparel");
  });
});
