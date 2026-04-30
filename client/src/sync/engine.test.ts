import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock the api module before importing the engine. Each test installs a fake
// fetch response via the mocks below. The engine imports `api` from
// @/lib/api, which we replace with a stub object whose methods return
// pre-built Response instances.
const mockSyncPost = vi.fn();
const mockRecurringGet = vi.fn();
const mockPendingGet = vi.fn();
const mockHistoryMarkerGet = vi.fn();
const mockHistoryMarkerVisitPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      sync: { $post: (...args: any[]) => mockSyncPost(...args) },
      recurring: { $get: () => mockRecurringGet() },
      pending: { $get: () => mockPendingGet() },
      "history-marker": {
        $get: () => mockHistoryMarkerGet(),
        visit: { $post: () => mockHistoryMarkerVisitPost() },
      },
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  logout: vi.fn(),
}));

import { sync } from "./engine.js";
import { db } from "@/db/local";
import { syncStatus } from "@/sync/status";
import type { Expense, Category, Subcategory } from "@/db/local";
import { logout } from "@/lib/auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
  // Reset Dexie state between tests
  await db.expenses.clear();
  await db.categories.clear();
  await db.subcategories.clear();
  await db.recurring_templates.clear();
  localStorage.clear();
  syncStatus.value = { state: "idle", pendingCount: 0 };
  mockSyncPost.mockReset();
  mockRecurringGet.mockReset();
  mockPendingGet.mockReset();
  mockHistoryMarkerGet.mockReset();
  mockHistoryMarkerVisitPost.mockReset();
  // Default no-op responses for the secondary fetches
  mockRecurringGet.mockResolvedValue(jsonResponse([]));
  mockPendingGet.mockResolvedValue(jsonResponse([]));
  mockHistoryMarkerGet.mockResolvedValue(jsonResponse({ has_unreviewed: false }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sync engine — successful sync", () => {
  it("marks pending records as synced after successful upload", async () => {
    const pending = makeExpense({ sync_status: "pending" });
    await db.expenses.put(pending);

    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    await sync();

    const after = await db.expenses.get(pending.id);
    expect(after?.sync_status).toBe("synced");
  });

  it("upserts server_changes into local Dexie", async () => {
    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [
        makeExpense({ id: "remote-1", amount: 5000 }),
        makeExpense({ id: "remote-2", amount: 7500 }),
      ],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    await sync();

    expect(await db.expenses.get("remote-1")).toBeDefined();
    expect(await db.expenses.get("remote-2")).toBeDefined();
    expect((await db.expenses.get("remote-1"))?.sync_status).toBe("synced");
  });

  it("persists last_sync watermark on success", async () => {
    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    await sync();

    expect(localStorage.getItem("xpensify_last_sync")).toBe("2026-04-30 12:00:00");
  });

  it("sends pending records and last_sync to the server", async () => {
    const pending = makeExpense({ sync_status: "pending", id: "p1" });
    await db.expenses.put(pending);
    localStorage.setItem("xpensify_last_sync", "2026-04-29 00:00:00");

    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    await sync();

    expect(mockSyncPost).toHaveBeenCalledOnce();
    const arg = mockSyncPost.mock.calls[0][0];
    expect(arg.json.last_sync).toBe("2026-04-29 00:00:00");
    expect(arg.json.changes.map((e: any) => e.id)).toEqual(["p1"]);
  });

  it("reconciles categories — removes stale local entries not in server response", async () => {
    await db.categories.put({ id: "stale-cat", name: "stale", icon: "x", color: "#000", sort_order: 99, created_at: "", updated_at: "" });
    const serverCats: Category[] = [
      { id: "cat-food", name: "food", icon: "food", color: "#ff6b6b", sort_order: 1, created_at: "", updated_at: "" },
    ];

    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: serverCats,
      subcategories: [],
    }));

    await sync();

    expect(await db.categories.get("stale-cat")).toBeUndefined();
    expect(await db.categories.get("cat-food")).toBeDefined();
  });
});

describe("sync engine — failure modes", () => {
  it("does NOT advance last_sync on network error", async () => {
    localStorage.setItem("xpensify_last_sync", "2026-04-29 00:00:00");
    mockSyncPost.mockRejectedValue(new Error("network down"));

    await sync();

    expect(localStorage.getItem("xpensify_last_sync")).toBe("2026-04-29 00:00:00");
    expect(syncStatus.value.state).toBe("offline");
  });

  it("does NOT advance last_sync on 500 server error", async () => {
    localStorage.setItem("xpensify_last_sync", "2026-04-29 00:00:00");
    mockSyncPost.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    await sync();

    expect(localStorage.getItem("xpensify_last_sync")).toBe("2026-04-29 00:00:00");
    expect(syncStatus.value.state).toBe("error");
  });

  it("does NOT mark pending records as synced when sync fails", async () => {
    const pending = makeExpense({ sync_status: "pending" });
    await db.expenses.put(pending);

    mockSyncPost.mockResolvedValue(jsonResponse({}, 500));

    await sync();

    const after = await db.expenses.get(pending.id);
    expect(after?.sync_status).toBe("pending");
  });

  it("calls logout() on 401, clearing local state", async () => {
    mockSyncPost.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    await sync();

    expect(logout).toHaveBeenCalledOnce();
  });

  it("does not stack concurrent syncs (state guard)", async () => {
    syncStatus.value = { state: "syncing", pendingCount: 0 };
    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: [],
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    await sync();

    expect(mockSyncPost).not.toHaveBeenCalled();
  });
});

describe("sync engine — bulk insert performance", () => {
  it("handles a large initial sync (3700 records) in a single transaction", async () => {
    const records: Expense[] = [];
    for (let i = 0; i < 3700; i++) {
      records.push(makeExpense({ id: `bulk-${i}`, amount: i }));
    }
    mockSyncPost.mockResolvedValue(jsonResponse({
      server_changes: records,
      sync_timestamp: "2026-04-30 12:00:00",
      categories: [],
      subcategories: [],
    }));

    const start = Date.now();
    await sync();
    const elapsed = Date.now() - start;

    const count = await db.expenses.count();
    expect(count).toBe(3700);
    // Sanity check: should be well under the previous-known clear-and-reinsert
    // window. fake-indexeddb is much slower than real IDB but bulkPut still
    // finishes in seconds, not minutes.
    expect(elapsed).toBeLessThan(15_000);
  }, 20_000);
});
