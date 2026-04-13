import { signal } from "@preact/signals";
import { animate } from "motion";

// ── Tab index mapping ────────────────────────────────────────────────────────

const TAB_PATHS = ["/", "/history", "/recurring", "/analytics"];

export function getTabIndex(path: string): number {
  const idx = TAB_PATHS.indexOf(path);
  return idx >= 0 ? idx : -1;
}

// ── Shared state ─────────────────────────────────────────────────────────────

/** The main content element — set by Shell, read by BottomNav */
export const contentEl = signal<HTMLElement | null>(null);

/**
 * Direction of the pending transition.
 *  1 = forward (slide left — higher tab index)
 * -1 = backward (slide right — lower tab index)
 *  0 = no pending transition
 */
export const pendingDirection = signal<number>(0);

/** Resolves when the animate-in completes. CategorySelector can await this. */
export const transitionDone = signal<Promise<void> | null>(null);

// Track in-flight animations so rapid taps can cancel them
let outAnim: { stop: () => void } | null = null;
let inAnim: { stop: () => void } | null = null;

// ── Navigate with transition ─────────────────────────────────────────────────

/**
 * Called by BottomNav to navigate between tabs with a directional transition.
 * `routeFn` is preact-iso's `route()`.
 */
export function navigateTab(
  newPath: string,
  currentPath: string,
  routeFn: (path: string) => void
) {
  const oldIdx = getTabIndex(currentPath);
  const newIdx = getTabIndex(newPath);
  const el = contentEl.value;

  // No transition for same tab, non-tab routes, or missing element
  if (oldIdx === newIdx || oldIdx < 0 || newIdx < 0 || !el) {
    routeFn(newPath);
    return;
  }

  // Cancel any in-progress transition
  if (outAnim) { outAnim.stop(); outAnim = null; }
  if (inAnim) { inAnim.stop(); inAnim = null; }

  // Direction: 1 = forward (slides left), -1 = backward (slides right)
  const dir = newIdx > oldIdx ? 1 : -1;
  pendingDirection.value = dir;

  // Animate out: opacity 1→0, translateX 0→dir*-15%
  el.style.willChange = "transform, opacity";
  const outX = `${dir * -15}%`;

  // Use animateMini-style call: element, DOMKeyframesDefinition, options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outAnim = (animate as any)(
    el,
    { opacity: [1, 0], transform: [`translateX(0%)`, `translateX(${outX})`] },
    { duration: 0.18, easing: "ease-out" }
  );

  (outAnim as any).then(() => {
    outAnim = null;
    // Pre-position for incoming animation
    const inX = `${dir * 30}%`;
    el.style.opacity = "0";
    el.style.transform = `translateX(${inX})`;
    // Navigate — triggers re-render with new screen
    routeFn(newPath);
  });
}

/**
 * Called by Shell after route change to animate in the new content.
 * Returns a promise that resolves when the animation completes.
 */
export function animateIn(): Promise<void> {
  const dir = pendingDirection.value;
  const el = contentEl.value;

  if (dir === 0 || !el) {
    return Promise.resolve();
  }

  pendingDirection.value = 0;

  // Animate in: from dir*30% → 0, opacity 0→1
  const fromX = `${dir * 30}%`;
  el.style.willChange = "transform, opacity";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inAnim = (animate as any)(
    el,
    { opacity: [0, 1], transform: [`translateX(${fromX})`, `translateX(0%)`] },
    { type: "spring", stiffness: 400, damping: 35 }
  );

  const done = new Promise<void>((resolve) => {
    (inAnim as any).then(() => {
      inAnim = null;
      if (el) {
        el.style.willChange = "";
        el.style.transform = "";
        el.style.opacity = "";
      }
      resolve();
    });
  });

  transitionDone.value = done;
  return done;
}
