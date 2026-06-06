import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import recurring from "./recurring.js";
import {
  db,
  ensureMigrated,
  resetDb,
  seedTestUsers,
  seedTestSession,
  sessionCookie,
  insertExpense,
  insertRecurringTemplate,
} from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let userAId: string;
let userBId: string;
let userACookie: string;
let userBCookie: string;
const app = mountRouter("recurring", recurring);

/** A next_due date guaranteed to fall in the current calendar month. */
function nextDueThisMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-28`;
}

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
  userBId = users.userB.id;
  userACookie = sessionCookie(seedTestSession(userAId));
  userBCookie = sessionCookie(seedTestSession(userBId));
});

describe("GET /api/recurring — household-shared list", () => {
  it("returns templates created by any household member", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 90000,
      frequency: "monthly",
      next_due: nextDueThisMonth(),
    });

    const res = await app.request("/api/recurring", { headers: { cookie: userBCookie } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data).toHaveLength(1);
    expect(data[0].amount).toBe(90000);
    expect(data[0].user_id).toBe(userAId);
  });

  it("returns 401 with no auth", async () => {
    const res = await app.request("/api/recurring");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/recurring/forecast — household-shared", () => {
  it("includes templates created by other household members", async () => {
    insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 50000,
      frequency: "monthly",
      next_due: nextDueThisMonth(),
    });

    const res = await app.request("/api/recurring/forecast", { headers: { cookie: userBCookie } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.total_count).toBe(1);
    expect(data.total_remaining).toBe(50000);
  });

  it("counts already-generated expenses regardless of which user they were stamped under", async () => {
    const templateId = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 50000,
      frequency: "monthly",
      next_due: nextDueThisMonth(),
    });
    // Generated expense stamped under the creator (user A); viewer is user B.
    insertExpense({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 50000,
      source: "recurring",
      recurring_template_id: templateId,
    });

    const res = await app.request("/api/recurring/forecast", { headers: { cookie: userBCookie } });
    const data = (await res.json()) as any;
    expect(data.total_count).toBe(1);
    expect(data.upcoming_count).toBe(0);
    expect(data.total_remaining).toBe(0);
    expect(data.items[0].already_generated).toBe(true);
  });
});

describe("PATCH /api/recurring/:id — any member can edit", () => {
  it("lets user B edit a template created by user A", async () => {
    const templateId = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 90000,
      frequency: "monthly",
      next_due: nextDueThisMonth(),
    });

    const res = await app.request(
      `/api/recurring/${templateId}`,
      jsonInit("PATCH", { cookie: userBCookie, body: { amount: 95000 } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.amount).toBe(95000);

    const row = db
      .prepare(`SELECT amount, user_id FROM recurring_templates WHERE id = ?`)
      .get(templateId) as any;
    expect(row.amount).toBe(95000);
    // Creator attribution is preserved.
    expect(row.user_id).toBe(userAId);
  });

  it("returns 404 for a genuinely missing template", async () => {
    const res = await app.request(
      `/api/recurring/does-not-exist`,
      jsonInit("PATCH", { cookie: userBCookie, body: { amount: 1 } }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/recurring/:id — any member can delete", () => {
  it("lets user B delete a template created by user A", async () => {
    const templateId = insertRecurringTemplate({
      user_id: userAId,
      category_id: "cat-household",
      subcategory_id: "sub-hh-utilities",
      amount: 90000,
      frequency: "monthly",
      next_due: nextDueThisMonth(),
    });

    const res = await app.request(
      `/api/recurring/${templateId}`,
      jsonInit("DELETE", { cookie: userBCookie }),
    );
    expect(res.status).toBe(200);

    const row = db
      .prepare(`SELECT id FROM recurring_templates WHERE id = ?`)
      .get(templateId);
    expect(row).toBeUndefined();
  });
});

describe("POST /api/recurring — still records creator", () => {
  it("stamps the new template with the creating user's id", async () => {
    const res = await app.request(
      "/api/recurring",
      jsonInit("POST", {
        cookie: userACookie,
        body: {
          category_id: "cat-household",
          subcategory_id: "sub-hh-utilities",
          amount: 90000,
          frequency: "monthly",
          day_of_month: 28,
        },
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.user_id).toBe(userAId);
  });
});
