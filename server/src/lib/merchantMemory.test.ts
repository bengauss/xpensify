import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { lookupMerchantMemory, upsertMerchantMemory, resetMerchantMemory } from "./merchantMemory.js";
import { db, ensureMigrated, resetDb, seedTestUsers } from "../test/db.js";

beforeAll(() => {
  ensureMigrated();
});

beforeEach(() => {
  resetDb();
  seedTestUsers();
});

describe("lookupMerchantMemory", () => {
  it("returns null for unknown merchant", () => {
    expect(lookupMerchantMemory("billa")).toBeNull();
  });

  it("returns null for empty merchant string", () => {
    expect(lookupMerchantMemory("")).toBeNull();
  });

  it("returns row when mapping exists", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row).not.toBeNull();
    expect(row?.category_id).toBe("cat-food");
    expect(row?.subcategory_id).toBe("sub-groceries");
    expect(row?.confirmation_count).toBe(1);
  });

  it("is household-wide — same merchant returns the same row regardless of caller", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    // No userId in lookup — there's just one household memory row.
    expect(lookupMerchantMemory("billa")).not.toBeNull();
  });
});

describe("upsertMerchantMemory", () => {
  it("inserts new mapping with count=1", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row?.confirmation_count).toBe(1);
  });

  it("increments count when same (category, subcategory) confirmed again", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T12:00:00.000Z");
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row?.confirmation_count).toBe(2);
    expect(row?.last_confirmed_at).toBe("2026-04-30T12:00:00.000Z");
  });

  it("resets count to 1 when category changes (user disagreement)", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T12:00:00.000Z");
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T13:00:00.000Z");
    // Now confirmation_count = 2

    upsertMerchantMemory("billa", "cat-household", "sub-hh-other", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row?.category_id).toBe("cat-household");
    expect(row?.subcategory_id).toBe("sub-hh-other");
    expect(row?.confirmation_count).toBe(1);
  });

  it("no-ops on empty merchant", () => {
    upsertMerchantMemory("", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const rows = db.prepare(`SELECT COUNT(*) as n FROM merchant_categories`).get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("updates last_confirmed_at on every upsert", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T00:00:00.000Z");
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T00:00:00.000Z");
    expect(lookupMerchantMemory("billa")?.last_confirmed_at).toBe("2026-04-30T00:00:00.000Z");
  });
});

describe("resetMerchantMemory", () => {
  it("creates row with count=1 if none exists", () => {
    resetMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row?.confirmation_count).toBe(1);
  });

  it("rewrites mapping and resets count to 1 when row exists", () => {
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T12:00:00.000Z");
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T13:00:00.000Z");
    upsertMerchantMemory("billa", "cat-food", "sub-groceries", "2026-04-29T14:00:00.000Z");
    expect(lookupMerchantMemory("billa")?.confirmation_count).toBe(3);

    resetMerchantMemory("billa", "cat-household", "sub-hh-other", "2026-04-30T12:00:00.000Z");
    const row = lookupMerchantMemory("billa");
    expect(row?.category_id).toBe("cat-household");
    expect(row?.subcategory_id).toBe("sub-hh-other");
    expect(row?.confirmation_count).toBe(1);
  });

  it("no-ops on empty merchant", () => {
    resetMerchantMemory("", "cat-food", "sub-groceries", "2026-04-30T12:00:00.000Z");
    const rows = db.prepare(`SELECT COUNT(*) as n FROM merchant_categories`).get() as { n: number };
    expect(rows.n).toBe(0);
  });
});
