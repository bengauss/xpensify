import { describe, it, expect } from "vitest";
import { computeDiscretionary, prevMonth, roundToHundred } from "./discretionary.js";
import type { Expense } from "@/db/local";

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    category_id: "cat-food",
    subcategory_id: "sub-groceries",
    amount: 1000,
    note: null,
    tags: null,
    image_url: null,
    timestamp: "2026-04-15T12:00:00.000Z",
    source: "manual",
    recurring_template_id: null,
    deleted: 0,
    status: "confirmed",
    auto_saved: 0,
    sync_status: "synced",
    created_at: "2026-04-15T12:00:00.000Z",
    updated_at: "2026-04-15T12:00:00.000Z",
    ...overrides,
  };
}

const APRIL_30 = new Date("2026-04-30T12:00:00.000Z");

describe("prevMonth", () => {
  it("decrements within the same year", () => {
    expect(prevMonth(2026, 4)).toEqual({ year: 2026, month: 3 });
  });

  it("rolls back across year boundary", () => {
    expect(prevMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("roundToHundred", () => {
  it("rounds to nearest €100 (10000 cents)", () => {
    expect(roundToHundred(123456)).toBe(120000);
    expect(roundToHundred(155000)).toBe(160000);
    expect(roundToHundred(0)).toBe(0);
  });
});

describe("computeDiscretionary", () => {
  it("returns null when expenses are undefined (loading)", () => {
    expect(computeDiscretionary(undefined, APRIL_30)).toBeNull();
  });

  it("returns 0/null when there are no expenses", () => {
    expect(computeDiscretionary([], APRIL_30)).toEqual({ current: 0, avg: null });
  });

  it("sums current month manual + apple-pay (excluding recurring)", () => {
    const expenses = [
      makeExpense({ source: "manual", amount: 1000, timestamp: "2026-04-15T12:00:00Z" }),
      makeExpense({ source: "apple-pay", amount: 500, timestamp: "2026-04-20T12:00:00Z" }),
      makeExpense({ source: "recurring", amount: 80000, timestamp: "2026-04-01T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    expect(result?.current).toBe(1500);
  });

  it("excludes soft-deleted expenses from current month", () => {
    const expenses = [
      makeExpense({ source: "manual", amount: 1000, timestamp: "2026-04-15T12:00:00Z" }),
      makeExpense({ source: "manual", amount: 9999, timestamp: "2026-04-15T12:00:00Z", deleted: 1 }),
    ];
    expect(computeDiscretionary(expenses, APRIL_30)?.current).toBe(1000);
  });

  it("excludes expenses outside current month", () => {
    const expenses = [
      makeExpense({ amount: 1000, timestamp: "2026-04-15T12:00:00Z" }),
      makeExpense({ amount: 5000, timestamp: "2026-03-15T12:00:00Z" }),
      makeExpense({ amount: 2000, timestamp: "2026-05-01T12:00:00Z" }),
    ];
    expect(computeDiscretionary(expenses, APRIL_30)?.current).toBe(1000);
  });

  it("computes 3-month trailing average without outliers", () => {
    // Months: Mar (3000), Feb (2000), Jan (1000) → all under 2× median (2*2000=4000)
    const expenses = [
      makeExpense({ amount: 3000, timestamp: "2026-03-15T12:00:00Z" }),
      makeExpense({ amount: 2000, timestamp: "2026-02-15T12:00:00Z" }),
      makeExpense({ amount: 1000, timestamp: "2026-01-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    // avg of (3000+2000+1000)/3 = 2000, rounded to nearest €100 → 0 (since 2000 cents = €20)
    // 2000 / 10000 = 0.2 → Math.round(0.2) = 0 → 0
    expect(result?.avg).toBe(0);
  });

  it("drops months over 2x median from average", () => {
    // [200000, 300000, 2200000] cents → median 300000, threshold 600000
    // 2200000 dropped → avg = (200000+300000)/2 = 250000 → roundToHundred → 250000
    const expenses = [
      makeExpense({ amount: 200000, timestamp: "2026-03-15T12:00:00Z" }),
      makeExpense({ amount: 300000, timestamp: "2026-02-15T12:00:00Z" }),
      makeExpense({ amount: 2200000, timestamp: "2026-01-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    expect(result?.avg).toBe(250000);
  });

  it("returns avg null when no historical data", () => {
    const expenses = [
      makeExpense({ amount: 1000, timestamp: "2026-04-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    expect(result?.current).toBe(1000);
    expect(result?.avg).toBeNull();
  });

  it("excludes recurring expenses from trailing months too", () => {
    const expenses = [
      makeExpense({ source: "recurring", amount: 80000, timestamp: "2026-03-01T12:00:00Z" }),
      makeExpense({ source: "manual", amount: 1000, timestamp: "2026-03-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    // March total (after excluding recurring) = 1000. Feb=Jan=0.
    // avg over 3 months = 1000/3 ≈ 333 → roundToHundred → 0
    expect(result?.avg).toBe(0);
  });

  it("rolls year boundary correctly when current month is January", () => {
    const JAN_15 = new Date("2026-01-15T12:00:00.000Z");
    const expenses = [
      makeExpense({ amount: 1000, timestamp: "2026-01-10T12:00:00Z" }), // current
      makeExpense({ amount: 5000, timestamp: "2025-12-15T12:00:00Z" }), // prev month
      makeExpense({ amount: 4000, timestamp: "2025-11-15T12:00:00Z" }),
      makeExpense({ amount: 6000, timestamp: "2025-10-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, JAN_15);
    expect(result?.current).toBe(1000);
    // avg of Dec (5000) + Nov (4000) + Oct (6000) = 15000/3 = 5000 cents → roundToHundred(5000) = 10000
    // (Math.round(0.5) = 1, then * 10000 = 10000)
    expect(result?.avg).toBe(10000);
  });

  it("apple-pay confirmed expenses count toward current discretionary", () => {
    const expenses = [
      makeExpense({ source: "apple-pay", status: "confirmed", amount: 1000, timestamp: "2026-04-15T12:00:00Z" }),
    ];
    const result = computeDiscretionary(expenses, APRIL_30);
    expect(result?.current).toBe(1000);
  });

  it("buckets a month-boundary timestamp by LOCAL month, not UTC (Theme A)", () => {
    // 2026-04-30T23:30Z is still April in UTC, but in Europe/Vienna (UTC+2 in
    // summer) it is 2026-05-01T01:30 local — i.e. May. History buckets it in May
    // via dateKey, so discretionary's current-month total must agree.
    const MAY_15 = new Date("2026-05-15T12:00:00.000Z");
    const expenses = [
      makeExpense({ amount: 1000, timestamp: "2026-04-30T23:30:00.000Z" }),
    ];
    // Old UTC-prefix logic (timestamp.startsWith("2026-05")) would miss this → 0.
    expect(computeDiscretionary(expenses, MAY_15)?.current).toBe(1000);
  });
});
