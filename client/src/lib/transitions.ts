import { signal } from "@preact/signals";

// ── Tab index mapping ────────────────────────────────────────────────────────

const TAB_PATHS = ["/", "/history", "/recurring", "/analytics"];

export function getTabIndex(path: string): number {
  const idx = TAB_PATHS.indexOf(path);
  return idx >= 0 ? idx : -1;
}

// ── Shared state ─────────────────────────────────────────────────────────────

/**
 * Direction of the pending tab transition.
 *  1 = forward (slide left, new screen enters from right)
 * -1 = backward (slide right, new screen enters from left)
 *  0 = no pending tab transition (non-tab nav or no nav)
 *
 * Set by navigateTab(), read + reset by TabTransitionContainer.
 */
export const pendingDirection = signal<number>(0);

/**
 * Promise that resolves when the current tab transition completes.
 * Per-screen entrance animations (CategorySelector reveal, list stagger, etc.)
 * await this before starting, so they play AFTER the crossfade.
 */
export const transitionDone = signal<Promise<void> | null>(null);

/** True while a tab crossfade is in progress. Blocks rapid taps. */
export const isTransitioning = signal<boolean>(false);

let resolveTransitionDone: (() => void) | null = null;

// ── Navigate with transition ─────────────────────────────────────────────────

/**
 * Called by BottomNav when a tab is tapped. Sets the pending direction
 * and triggers the route change. TabTransitionContainer picks up the
 * signal and performs the crossfade.
 */
export function navigateTab(
  newPath: string,
  currentPath: string,
  routeFn: (path: string) => void
) {
  // Ignore rapid taps during an in-flight transition
  if (isTransitioning.value) return;

  const oldIdx = getTabIndex(currentPath);
  const newIdx = getTabIndex(newPath);

  // Same tab or non-tab route: just navigate without animation
  if (oldIdx === newIdx || oldIdx < 0 || newIdx < 0) {
    routeFn(newPath);
    return;
  }

  pendingDirection.value = newIdx > oldIdx ? 1 : -1;
  transitionDone.value = new Promise<void>((resolve) => {
    resolveTransitionDone = resolve;
  });

  routeFn(newPath);
}

/** Called by TabTransitionContainer when the transition finishes. */
export function completeTransition() {
  if (resolveTransitionDone) {
    resolveTransitionDone();
    resolveTransitionDone = null;
  }
}
