import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./local.js";
import type { Expense } from "./local.js";

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    category_id: "cat-food",
    subcategory_id: "sub-groceries",
    amount: 1000,
    note: null,
    tags: null,
    image_url: null,
    timestamp: "2026-04-30T12:00:00.000Z",
    source: "manual",
    recurring_template_id: null,
    deleted: 0,
    status: "confirmed",
    sync_status: "synced",
    created_at: "2026-04-30T12:00:00.000Z",
    updated_at: "2026-04-30T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await db.expenses.clear();
  await db.categories.clear();
  await db.subcategories.clear();
  await db.recurring_templates.clear();
});

describe("Dexie local DB — basic CRUD", () => {
  it("adds and retrieves an expense by id", async () => {
    const expense = makeExpense({ id: "e1", amount: 1234 });
    await db.expenses.put(expense);
    const fetched = await db.expenses.get("e1");
    expect(fetched?.amount).toBe(1234);
  });

  it("updates an expense via put", async () => {
    const expense = makeExpense({ id: "e1", amount: 1234 });
    await db.expenses.put(expense);
    await db.expenses.put({ ...expense, amount: 9999 });
    expect((await db.expenses.get("e1"))?.amount).toBe(9999);
  });

  it("deletes an expense", async () => {
    const expense = makeExpense({ id: "e1" });
    await db.expenses.put(expense);
    await db.expenses.delete("e1");
    expect(await db.expenses.get("e1")).toBeUndefined();
  });

  it("filters by sync_status index", async () => {
    await db.expenses.put(makeExpense({ id: "p1", sync_status: "pending" }));
    await db.expenses.put(makeExpense({ id: "p2", sync_status: "pending" }));
    await db.expenses.put(makeExpense({ id: "s1", sync_status: "synced" }));

    const pending = await db.expenses.where("sync_status").equals("pending").toArray();
    expect(pending).toHaveLength(2);
  });

  it("range queries by timestamp use the index", async () => {
    await db.expenses.put(makeExpense({ id: "old", timestamp: "2026-01-15T12:00:00Z" }));
    await db.expenses.put(makeExpense({ id: "mid", timestamp: "2026-04-15T12:00:00Z" }));
    await db.expenses.put(makeExpense({ id: "new", timestamp: "2026-04-30T12:00:00Z" }));

    const inApril = await db.expenses
      .where("timestamp")
      .between("2026-04-01", "2026-05-01")
      .toArray();
    expect(inApril.map((e) => e.id).sort()).toEqual(["mid", "new"]);
  });

  it("bulkPut inserts many records atomically", async () => {
    const records = Array.from({ length: 100 }, (_, i) => makeExpense({ id: `b${i}`, amount: i }));
    await db.expenses.bulkPut(records);
    expect(await db.expenses.count()).toBe(100);
  });

  it("transaction wraps multiple operations", async () => {
    await db.transaction("rw", db.expenses, async () => {
      await db.expenses.put(makeExpense({ id: "tx-1", amount: 100 }));
      await db.expenses.put(makeExpense({ id: "tx-2", amount: 200 }));
    });
    expect(await db.expenses.count()).toBe(2);
  });
});

describe("Dexie local DB — soft delete pattern", () => {
  it("filter(deleted=0) excludes soft-deleted rows", async () => {
    await db.expenses.put(makeExpense({ id: "live", deleted: 0 }));
    await db.expenses.put(makeExpense({ id: "tomb", deleted: 1 }));
    const visible = await db.expenses.filter((e) => e.deleted === 0).toArray();
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("live");
  });
});
