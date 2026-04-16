import { syncStatus } from "@/sync/status";

type Visual = "offline" | "error" | "working" | "idle";

function pickVisual(state: string, pendingCount: number): Visual {
  if (state === "offline") return "offline";
  if (state === "error") return "error";
  if (state === "syncing" || pendingCount > 0) return "working";
  return "idle";
}

export function SyncIndicator() {
  const { state, pendingCount } = syncStatus.value;
  const visual = pickVisual(state, pendingCount);

  // Keying on visual+pendingCount remounts the inner span on state change,
  // which replays the sync-indicator-enter CSS animation — a subtle
  // opacity + scale-up so state flips don't snap abruptly.
  const key = `${visual}-${pendingCount}`;

  return (
    <span key={key} class="sync-indicator-enter inline-flex items-center">
      {visual === "offline" && (
        <span
          title="Offline"
          class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-text-secondary)]"
        />
      )}
      {visual === "error" && (
        <span
          title="Sync error"
          class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-warning)]"
        />
      )}
      {visual === "working" && (
        <span
          title={`${pendingCount} pending`}
          class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent"
        >
          {pendingCount > 0 ? `${pendingCount} pending` : "syncing…"}
        </span>
      )}
      {visual === "idle" && (
        <span
          title="Synced"
          class="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-success)]"
        />
      )}
    </span>
  );
}
