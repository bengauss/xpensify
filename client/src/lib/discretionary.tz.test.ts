// Timezone-boundary regression for F7 (issue #42): discretionary must bucket
// expenses by LOCAL calendar date, matching History's dateKey(), so a single
// expense never lands in different months on different screens.
//
// Pinned to a behind-UTC zone (America/New_York) so a timestamp near a month
// boundary has a UTC month that differs from its local month. Each vitest file
// runs in its own fork (pool: "forks"), so this TZ override doesn't leak.
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import { computeDiscretionary } from "./discretionary.js";
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

// "now" is mid-April local (noon UTC → 08:00 EDT, April 15).
const APRIL_15 = new Date("2026-04-15T12:00:00.000Z");

describe("computeDiscretionary — local-date bucketing (F7 regression)", () => {
  it("counts a UTC-May timestamp that is April locally in the April total", () => {
    // 2026-05-01T02:00Z → 2026-04-30 22:00 EDT → local April 30.
    // Old UTC-prefix logic ("2026-05-01...".startsWith("2026-04")) dropped it.
    const expenses = [
      makeExpense({ amount: 1500, timestamp: "2026-05-01T02:00:00.000Z" }),
    ];
    expect(computeDiscretionary(expenses, APRIL_15)?.current).toBe(1500);
  });

  it("excludes a UTC-April timestamp that is March locally from the April total", () => {
    // 2026-04-01T01:00Z → 2026-03-31 21:00 EDT → local March 31.
    // Old UTC-prefix logic counted it in April; local bucketing must not.
    const expenses = [
      makeExpense({ amount: 1500, timestamp: "2026-04-01T01:00:00.000Z" }),
    ];
    expect(computeDiscretionary(expenses, APRIL_15)?.current).toBe(0);
  });
});
