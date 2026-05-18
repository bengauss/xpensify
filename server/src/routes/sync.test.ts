import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import sync from "./sync.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, insertExpense } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let userAId: string;
let userBId: string;
let userACookie: string;
let userBCookie: string;
const app = mountRouter("sync", sync);

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
  userBId = users.userB.id;
  userACookie = sessionCookie(seedTestSession(userAId));
  userBCookie = sessionCookie(seedTestSession(userBId));
});

async function postSync(cookie: string, body: unknown) {
  return app.request("/api/sync", jsonInit("POST", { cookie, body }));
}

describe("POST /api/sync — auth", () => {
  it("rejects requests without a session cookie", async () => {
    const res = await app.request("/api/sync", jsonInit("POST", { body: { changes: [], last_sync: null } }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/sync — initial sync (last_sync = null)", () => {
  it("returns all confirmed expenses including soft-deleted tombstones", async () => {
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 1000 });
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 2000, deleted: 1 });
    insertExpense({ user_id: userBId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 3000 });

    const res = await postSync(userACookie, { changes: [], last_sync: null });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.server_changes).toHaveLength(3);
    const deleted = data.server_changes.filter((e: any) => e.deleted === 1);
    expect(deleted).toHaveLength(1);
  });

  it("excludes pending expenses from initial sync", async () => {
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 1000, status: "pending" });
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 2000, status: "confirmed" });

    const res = await postSync(userACookie, { changes: [], last_sync: null });
    const data = await res.json() as any;
    expect(data.server_changes).toHaveLength(1);
    expect(data.server_changes[0].amount).toBe(2000);
  });

  it("returns full categories and subcategories", async () => {
    const res = await postSync(userACookie, { changes: [], last_sync: null });
    const data = await res.json() as any;
    expect(data.categories.length).toBeGreaterThan(10);
    expect(data.subcategories.length).toBeGreaterThan(10);
  });
});

describe("POST /api/sync — users payload", () => {
  it("returns the household users with id/username/display_name/avatar_color", async () => {
    const res = await postSync(userACookie, { changes: [], last_sync: null });
    const data = await res.json() as any;
    expect(Array.isArray(data.users)).toBe(true);
    // Two seeded test users (alice + bob)
    expect(data.users).toHaveLength(2);
    for (const u of data.users) {
      expect(Object.keys(u).sort()).toEqual(
        ["avatar_color", "display_name", "id", "username"].sort(),
      );
      // EXPLICITLY ensure no password_hash or other server-only fields leak
      expect("password_hash" in u).toBe(false);
      expect("created_at" in u).toBe(false);
    }
    const usernames = data.users.map((u: any) => u.username).sort();
    expect(usernames).toEqual(["alice", "bob"]);
  });

  it("returns users on delta sync too (not just initial)", async () => {
    const res = await postSync(userACookie, { changes: [], last_sync: "2026-04-29 00:00:00" });
    const data = await res.json() as any;
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users).toHaveLength(2);
  });
});

describe("POST /api/sync — delta sync", () => {
  it("returns only records updated after last_sync", async () => {
    const id1 = insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 1000, updated_at: "2026-04-29 10:00:00" });
    const lastSync = "2026-04-29 12:00:00";
    insertExpense({ user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 2000, updated_at: "2026-04-30 10:00:00" });

    const res = await postSync(userACookie, { changes: [], last_sync: lastSync });
    const data = await res.json() as any;
    expect(data.server_changes).toHaveLength(1);
    expect(data.server_changes[0].amount).toBe(2000);
    // The older record is excluded
    expect(data.server_changes.every((e: any) => e.id !== id1)).toBe(true);
  });

  it("returns server's now() as sync_timestamp", async () => {
    const res = await postSync(userACookie, { changes: [], last_sync: null });
    const data = await res.json() as any;
    expect(data.sync_timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("POST /api/sync — last-write-wins by server time", () => {
  it("server stamps its own updated_at, ignoring client value", async () => {
    const id = crypto.randomUUID();
    const futureTimestamp = "2099-01-01 00:00:00";

    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 1000,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: futureTimestamp,
        },
      ],
      last_sync: null,
    });
    expect(res.status).toBe(200);

    const row = db.prepare("SELECT updated_at FROM expenses WHERE id = ?").get(id) as { updated_at: string };
    expect(row.updated_at).not.toBe(futureTimestamp);
    // Server-stamped time should be roughly now
    const serverTime = new Date(row.updated_at + "Z").getTime();
    expect(Math.abs(Date.now() - serverTime)).toBeLessThan(60_000);
  });

  it("rejects client write when server has newer version, returns server row in delta", async () => {
    const id = crypto.randomUUID();
    // Insert a row, then force its updated_at to be far in the future
    insertExpense({ id, user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 5000 });
    db.prepare(`UPDATE expenses SET updated_at = '2099-01-01 00:00:00', amount = 5000 WHERE id = ?`).run(id);

    // Client sends a stale write
    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 9999,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-29 10:00:00",
        },
      ],
      last_sync: "2026-04-28 00:00:00",
    });
    const data = await res.json() as any;
    // Server kept its 5000 amount
    const row = db.prepare("SELECT amount FROM expenses WHERE id = ?").get(id) as { amount: number };
    expect(row.amount).toBe(5000);
    // The authoritative row flows back to the client
    const serverRow = data.server_changes.find((e: any) => e.id === id);
    expect(serverRow).toBeDefined();
    expect(serverRow.amount).toBe(5000);
  });
});

describe("POST /api/sync — appliedIds excludes echoed changes", () => {
  it("does NOT include accepted insert in the delta response", async () => {
    const id = crypto.randomUUID();
    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 1000,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 10:00:00",
        },
      ],
      last_sync: "2026-04-29 00:00:00",
    });
    const data = await res.json() as any;
    expect(data.server_changes.find((e: any) => e.id === id)).toBeUndefined();
  });
});

describe("POST /api/sync — cross-user writes", () => {
  it("Alice can edit Bob's expense (shared household ledger)", async () => {
    const id = crypto.randomUUID();
    insertExpense({ id, user_id: userBId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 1000, updated_at: "2026-04-29 00:00:00" });

    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 9999,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: "2026-04-29 00:00:00",
    });
    expect(res.status).toBe(200);

    const row = db.prepare("SELECT amount, user_id FROM expenses WHERE id = ?").get(id) as { amount: number; user_id: string };
    expect(row.amount).toBe(9999);
    // user_id is unchanged — original owner remains
    expect(row.user_id).toBe(userBId);
  });
});

describe("POST /api/sync — validation", () => {
  it("rejects expense where subcategory does not belong to category", async () => {
    const id = crypto.randomUUID();
    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-rent", // belongs to cat-living, not cat-food
          amount: 1000,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: null,
    });
    expect(res.status).toBe(200);
    const exists = db.prepare("SELECT 1 FROM expenses WHERE id = ?").get(id);
    expect(exists).toBeUndefined();
  });

  it("rejects oversized notes (> 1000 chars)", async () => {
    const id = crypto.randomUUID();
    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 1000,
          note: "x".repeat(1001),
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: null,
    });
    expect(res.status).toBe(200);
    const exists = db.prepare("SELECT 1 FROM expenses WHERE id = ?").get(id);
    expect(exists).toBeUndefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userACookie },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("ignores changes with empty/missing id", async () => {
    const res = await postSync(userACookie, {
      changes: [
        {
          id: "",
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 1000,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: null,
    });
    expect(res.status).toBe(200);
    const count = (db.prepare("SELECT COUNT(*) as n FROM expenses").get() as { n: number }).n;
    expect(count).toBe(0);
  });
});

describe("POST /api/sync — soft delete propagation", () => {
  it("soft-deleted expense flows through sync as deleted=1, not hard delete", async () => {
    const id = crypto.randomUUID();
    insertExpense({ id, user_id: userAId, category_id: "cat-food", subcategory_id: "sub-groceries", amount: 1000, updated_at: "2026-04-29 00:00:00" });

    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 1000,
          timestamp: "2026-04-30T12:00:00.000Z",
          updated_at: "2026-04-30 12:00:00",
          deleted: 1,
        },
      ],
      last_sync: null,
    });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT deleted FROM expenses WHERE id = ?").get(id) as { deleted: number };
    expect(row.deleted).toBe(1);
  });
});

describe("POST /api/sync — recategorization signal", () => {
  it("editing apple-pay expense's category resets merchant memory to count=1", async () => {
    const id = crypto.randomUUID();
    insertExpense({
      id,
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      note: "billa",
      source: "apple-pay",
      updated_at: "2026-04-29 00:00:00",
    });
    // Pretend memory has accumulated 3 confirmations
    db.prepare(
      `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES ('billa', 'cat-food', 'sub-groceries', 3, '2026-04-29T00:00:00.000Z')`,
    ).run();

    // User edits the expense, changing category to household/other
    const res = await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-household",
          subcategory_id: "sub-hh-other",
          amount: 1000,
          note: "billa",
          timestamp: "2026-04-30T12:00:00.000Z",
          source: "apple-pay",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: "2026-04-28 00:00:00",
    });
    expect(res.status).toBe(200);

    const memory = db
      .prepare(`SELECT category_id, subcategory_id, confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string; subcategory_id: string; confirmation_count: number };
    expect(memory.category_id).toBe("cat-household");
    expect(memory.subcategory_id).toBe("sub-hh-other");
    expect(memory.confirmation_count).toBe(1);
  });

  it("editing only amount on apple-pay expense does NOT reset memory", async () => {
    const id = crypto.randomUUID();
    insertExpense({
      id,
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      note: "billa",
      source: "apple-pay",
      updated_at: "2026-04-29 00:00:00",
    });
    db.prepare(
      `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES ('billa', 'cat-food', 'sub-groceries', 3, '2026-04-29T00:00:00.000Z')`,
    ).run();

    await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-food",
          subcategory_id: "sub-groceries",
          amount: 9999, // changed
          note: "billa",
          timestamp: "2026-04-30T12:00:00.000Z",
          source: "apple-pay",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: "2026-04-28 00:00:00",
    });

    const memory = db
      .prepare(`SELECT confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { confirmation_count: number };
    expect(memory.confirmation_count).toBe(3);
  });

  it("editing a non-apple-pay (manual) expense's category does NOT touch merchant memory", async () => {
    const id = crypto.randomUUID();
    insertExpense({
      id,
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      note: "billa",
      source: "manual",
      updated_at: "2026-04-29 00:00:00",
    });
    db.prepare(
      `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES ('billa', 'cat-food', 'sub-groceries', 3, '2026-04-29T00:00:00.000Z')`,
    ).run();

    await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-household",
          subcategory_id: "sub-hh-other",
          amount: 1000,
          note: "billa",
          timestamp: "2026-04-30T12:00:00.000Z",
          source: "manual",
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: "2026-04-28 00:00:00",
    });

    const memory = db
      .prepare(`SELECT category_id, confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string; confirmation_count: number };
    expect(memory.category_id).toBe("cat-food");
    expect(memory.confirmation_count).toBe(3);
  });

  it("soft-deleting an apple-pay expense does NOT reset merchant memory", async () => {
    const id = crypto.randomUUID();
    insertExpense({
      id,
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 1000,
      note: "billa",
      source: "apple-pay",
      updated_at: "2026-04-29 00:00:00",
    });
    db.prepare(
      `INSERT INTO merchant_categories (merchant_normalized, category_id, subcategory_id, confirmation_count, last_confirmed_at)
       VALUES ('billa', 'cat-food', 'sub-groceries', 3, '2026-04-29T00:00:00.000Z')`,
    ).run();

    // User soft-deletes the expense — deletion isn't a recategorization
    await postSync(userACookie, {
      changes: [
        {
          id,
          category_id: "cat-household",
          subcategory_id: "sub-hh-other",
          amount: 1000,
          note: "billa",
          timestamp: "2026-04-30T12:00:00.000Z",
          source: "apple-pay",
          deleted: 1,
          updated_at: "2026-04-30 12:00:00",
        },
      ],
      last_sync: "2026-04-28 00:00:00",
    });

    const memory = db
      .prepare(`SELECT category_id, confirmation_count FROM merchant_categories WHERE merchant_normalized = 'billa'`)
      .get() as { category_id: string; confirmation_count: number };
    expect(memory.category_id).toBe("cat-food");
    expect(memory.confirmation_count).toBe(3);
  });
});
