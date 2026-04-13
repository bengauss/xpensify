import { signal } from "@preact/signals";

export const syncStatus = signal<{
  state: "idle" | "syncing" | "offline" | "error";
  pendingCount: number;
}>({ state: "idle", pendingCount: 0 });
