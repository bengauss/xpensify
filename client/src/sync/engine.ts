import { db } from "@/db/local";
import type { RecurringTemplate } from "@/db/local";
import { syncStatus } from "@/sync/status";
import { api } from "@/lib/api";

export async function sync(): Promise<void> {
  // Don't stack syncs
  if (syncStatus.value.state === "syncing") return;

  // Count pending before attempting
  const pending = await db.expenses.where("sync_status").equals("pending").toArray();
  syncStatus.value = { state: "syncing", pendingCount: pending.length };

  const lastSync = localStorage.getItem("xpensify_last_sync");

  let res: Response;
  try {
    res = await api.api.sync.$post({ json: { changes: pending, last_sync: lastSync } });
  } catch {
    // Network error — go offline
    const stillPending = await db.expenses.where("sync_status").equals("pending").count();
    syncStatus.value = { state: "offline", pendingCount: stillPending };
    return;
  }

  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!res.ok) {
    const stillPending = await db.expenses.where("sync_status").equals("pending").count();
    syncStatus.value = { state: "error", pendingCount: stillPending };
    return;
  }

  const data = await res.json() as {
    server_changes: import("@/db/local").Expense[];
    sync_timestamp: string;
    categories?: import("@/db/local").Category[];
    subcategories?: import("@/db/local").Subcategory[];
  };

  // Mark the records we sent as synced
  if (pending.length > 0) {
    const sentIds = pending.map((e) => e.id);
    await db.expenses.where("id").anyOf(sentIds).modify({ sync_status: "synced" });
  }

  // Upsert server changes
  if (data.server_changes && data.server_changes.length > 0) {
    const withStatus = data.server_changes.map((e) => ({ ...e, sync_status: "synced" as const }));
    await db.expenses.bulkPut(withStatus);
  }

  // Upsert categories and subcategories from server
  if (data.categories && data.categories.length > 0) {
    await db.categories.bulkPut(data.categories);
  }
  if (data.subcategories && data.subcategories.length > 0) {
    await db.subcategories.bulkPut(data.subcategories);
  }

  // Persist the new watermark
  if (data.sync_timestamp) {
    localStorage.setItem("xpensify_last_sync", data.sync_timestamp);
  }

  const remaining = await db.expenses.where("sync_status").equals("pending").count();
  syncStatus.value = { state: "idle", pendingCount: remaining };

  // Separately fetch recurring templates and upsert into local DB
  try {
    const templatesRes = await api.api.recurring.$get();
    if (templatesRes.ok) {
      const templates = await templatesRes.json() as RecurringTemplate[];
      if (Array.isArray(templates) && templates.length > 0) {
        await db.recurring_templates.bulkPut(templates);
      }
    }
  } catch {
    // Non-fatal: recurring templates will just be stale / empty
  }
}
