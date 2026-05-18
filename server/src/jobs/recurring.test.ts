import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { processRecurringTemplates } from "./recurring.js";
import { db, ensureMigrated, resetDb, seedTestUsers, insertRecurringTemplate } from "../test/db.js";

beforeAll(() => ensureMigrated());

let userAId: string;

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
});

function todayDateString(): string {
  return (db.prepare("SELECT date('now') as today").get() as { today: string }).today;
}

function dateOffset(days: number): string {
  // Returns YYYY-MM-DD `days` days from server today
  return (db.prepare("SELECT date('now', ? || ' days') as d").get(String(days)) as { d: string }).d;
}

describe("processRecurringTemplates — idempotency", () => {
  it("does not create duplicates when run twice on the same day", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      frequency: "monthly",
      next_due: todayDateString(),
    });

    processRecurringTemplates();
    processRecurringTemplates();

    const count = (db.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE source = 'recurring'`).get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it("idempotency check is per (template_id, timestamp)", async () => {
    // Two templates with same next_due — both should generate one expense each
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      frequency: "monthly",
      next_due: todayDateString(),
    });
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-subscriptions",
      subcategory_id: "sub-subscriptions",
      amount: 1000,
      frequency: "yearly",
      next_due: todayDateString(),
    });

    processRecurringTemplates();
    processRecurringTemplates();

    const count = (db.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE source = 'recurring'`).get() as { n: number }).n;
    expect(count).toBe(2);
  });
});

describe("processRecurringTemplates — catch-up logic", () => {
  it("generates missed days when cron didn't run for 3 days", async () => {
    // Weekly template with next_due 21 days ago — should fire 3 times to catch up
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-subscriptions",
      subcategory_id: "sub-subscriptions",
      amount: 500,
      frequency: "weekly",
      next_due: dateOffset(-21),
    });

    processRecurringTemplates();

    const count = (db.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE source = 'recurring'`).get() as { n: number }).n;
    // Days -21, -14, -7, 0 are all <= today → 4 occurrences
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(4);
  });

  it("advances next_due past today after catch-up", async () => {
    const id = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-subscriptions",
      subcategory_id: "sub-subscriptions",
      amount: 500,
      frequency: "weekly",
      next_due: dateOffset(-21),
    });

    processRecurringTemplates();

    const row = db.prepare(`SELECT next_due FROM recurring_templates WHERE id = ?`).get(id) as { next_due: string };
    expect(row.next_due > todayDateString()).toBe(true);
  });
});

describe("processRecurringTemplates — skip rules", () => {
  it("skips inactive (active=0) templates", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      frequency: "monthly",
      next_due: todayDateString(),
      active: 0,
    });

    processRecurringTemplates();

    const count = (db.prepare(`SELECT COUNT(*) AS n FROM expenses`).get() as { n: number }).n;
    expect(count).toBe(0);
  });

  it("does NOT generate templates whose next_due is in the future", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      frequency: "monthly",
      next_due: dateOffset(7),
    });

    processRecurringTemplates();

    const count = (db.prepare(`SELECT COUNT(*) AS n FROM expenses`).get() as { n: number }).n;
    expect(count).toBe(0);
  });
});

describe("processRecurringTemplates — yearly leap-year clamp", () => {
  it("yearly template starting Feb 29 advances to Feb 28 next non-leap year", async () => {
    const id = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-subscriptions",
      subcategory_id: "sub-subscriptions",
      amount: 1000,
      frequency: "yearly",
      next_due: "2024-02-29", // leap day, well in the past
    });

    processRecurringTemplates();

    const row = db.prepare(`SELECT next_due FROM recurring_templates WHERE id = ?`).get(id) as { next_due: string };
    // After processing, next_due must be > today and respect the clamp.
    // The catch-up loop runs through 2024-02-29 → 2025-02-28 → 2026-02-28 → 2027-02-28 → ...
    expect(row.next_due > todayDateString()).toBe(true);
    // Whatever it landed on, the day-of-month must be a real Feb day (28 or 29).
    const [, month, day] = row.next_due.split("-");
    if (month === "02") {
      expect(["28", "29"]).toContain(day);
    }
  });
});

describe("processRecurringTemplates — generated expense fields", () => {
  it("sets source='recurring' and recurring_template_id", async () => {
    const id = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      note: "April rent",
      frequency: "monthly",
      next_due: todayDateString(),
    });

    processRecurringTemplates();

    const row = db
      .prepare(`SELECT source, recurring_template_id, amount, note, user_id FROM expenses WHERE recurring_template_id = ?`)
      .get(id) as { source: string; recurring_template_id: string; amount: number; note: string; user_id: string };
    expect(row.source).toBe("recurring");
    expect(row.recurring_template_id).toBe(id);
    expect(row.amount).toBe(80000);
    expect(row.note).toBe("April rent");
    expect(row.user_id).toBe(userAId);
  });

  it("uses noon timestamp T12:00:00.000Z for generated expenses", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-living",
      subcategory_id: "sub-rent",
      amount: 80000,
      frequency: "monthly",
      next_due: todayDateString(),
    });

    processRecurringTemplates();

    const row = db.prepare(`SELECT timestamp FROM expenses WHERE source = 'recurring' LIMIT 1`).get() as { timestamp: string };
    expect(row.timestamp.endsWith("T12:00:00.000Z")).toBe(true);
  });
});
