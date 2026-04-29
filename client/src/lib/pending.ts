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
