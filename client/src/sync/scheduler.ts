import { sync } from "@/sync/engine";
import { syncStatus } from "@/sync/status";
import { db } from "@/db/local";
import { refreshPendingExpenses, refreshUnreviewedAutoSaves } from "@/lib/pending";

let intervalId: ReturnType<typeof setInterval> | null = null;

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && navigator.onLine) {
    sync().catch(console.error);
    refreshPendingExpenses().catch(() => {});
    refreshUnreviewedAutoSaves().catch(() => {});
  }
}

function handleOnline() {
  updatePendingCount().catch(console.error);
  sync().catch(console.error);
}

function handleOffline() {
  db.expenses
    .where("sync_status")
    .equals("pending")
    .count()
    .then((count) => {
      syncStatus.value = { state: "offline", pendingCount: count };
    })
    .catch(console.error);
}

async function updatePendingCount() {
  const count = await db.expenses.where("sync_status").equals("pending").count();
  if (syncStatus.value.state !== "syncing") {
    syncStatus.value = {
      state: navigator.onLine ? "idle" : "offline",
      pendingCount: count,
    };
  }
}

export function startSyncScheduler(): void {
  // Run an initial sync
  if (navigator.onLine) {
    sync().catch(console.error);
  } else {
    handleOffline();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  intervalId = setInterval(() => {
    if (navigator.onLine && document.visibilityState === "visible") {
      sync().catch(console.error);
    }
  }, 30_000);
}

export function stopSyncScheduler(): void {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);

  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
