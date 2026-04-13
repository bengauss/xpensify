import { syncStatus } from "@/sync/status";

export function SyncIndicator() {
  const { state, pendingCount } = syncStatus.value;

  if (state === "offline") {
    return (
      <span
        title="Offline"
        class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-text-secondary)]"
      />
    );
  }

  if (state === "error") {
    return (
      <span
        title="Sync error"
        class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-warning)]"
      />
    );
  }

  if (state === "syncing" || pendingCount > 0) {
    return (
      <span
        title={`${pendingCount} pending`}
        class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent"
      >
        {pendingCount > 0 ? `${pendingCount} pending` : "syncing…"}
      </span>
    );
  }

  // idle + no pending — green dot
  return (
    <span
      title="Synced"
      class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-success)]"
    />
  );
}
