import { signal } from "@preact/signals";
import { api } from "@/lib/api";
import type { PendingExpense } from "@/db/local";

export const pendingExpenses = signal<PendingExpense[]>([]);

/**
 * Set when the user opens the Add screen in confirmation mode for a specific
 * pending expense. The Add screen reads this and pre-fills amount + note from
 * the pending row, hides the discretionary counter, and swaps in a save bar.
 */
export const confirmingPending = signal<PendingExpense | null>(null);

/**
 * True when the current user has auto-saved Apple Pay expenses created since
 * their last History visit. Drives the small accent dot on the History tab
 * icon. Refreshed on sync; cleared by `markHistoryVisited()` (called from the
 * History screen on mount).
 */
export const hasUnreviewedAutoSaves = signal<boolean>(false);

export async function refreshUnreviewedAutoSaves(): Promise<void> {
  try {
    const res = await api.api["history-marker"].$get();
    if (!res.ok) return;
    const data = (await res.json()) as { has_unreviewed: boolean };
    hasUnreviewedAutoSaves.value = !!data.has_unreviewed;
  } catch {
    // Non-fatal — stale dot state will be refreshed on the next sync.
  }
}

export async function markHistoryVisited(): Promise<void> {
  hasUnreviewedAutoSaves.value = false;
  try {
    await api.api["history-marker"].visit.$post();
  } catch {
    // Best-effort; if the visit POST fails the server-side marker stays stale
    // but the in-memory signal is already cleared, so the dot disappears now
    // and the next sync's refresh confirms it.
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Fetch the current user's pending expenses from the server and update the
 * shared `pendingExpenses` signal. Coalesces concurrent calls; failures are
 * logged but never throw.
 */
export async function refreshPendingExpenses(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await api.api.pending.$get();
      if (!res.ok) return;
      const data = (await res.json()) as PendingExpense[];
      pendingExpenses.value = Array.isArray(data) ? data : [];
    } catch {
      // Swallow — non-fatal; the banner will simply not appear until next refresh.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
