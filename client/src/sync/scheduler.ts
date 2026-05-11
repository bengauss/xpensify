import { sync } from "@/sync/engine";
import { syncStatus } from "@/sync/status";
import { db } from "@/db/local";
import { refreshPendingExpenses, refreshUnreviewedAutoSaves } from "@/lib/pending";

let intervalId: ReturnType<typeof setInterval> | null = null;

function handleSwMessage(event: MessageEvent) {
  const data = event.data as { type?: string } | null;
  if (!data || data.type !== "push-received") return;
  // Server-side push fired (Apple Pay event, mostly). Refresh pending +
  // history-marker so the open app's UI updates without waiting for the
  // next visibility / 30s tick.
  refreshPendingExpenses().catch(() => {});
  refreshUnreviewedAutoSaves().catch(() => {});
}

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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
  }

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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", handleSwMessage);
  }

  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
