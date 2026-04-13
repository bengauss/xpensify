import { signal } from "@preact/signals";
import { animate } from "motion";

// ── Tab index mapping ────────────────────────────────────────────────────────

const TAB_PATHS = ["/", "/history", "/recurring", "/analytics"];

export function getTabIndex(path: string): number {
  const idx = TAB_PATHS.indexOf(path);
  return idx >= 0 ? idx : -1;
}

// ── Shared state ─────────────────────────────────────────────────────────────

export const contentEl = signal<HTMLElement | null>(null);
export const pendingDirection = signal<number>(0);
export const transitionDone = signal<Promise<void> | null>(null);

let inAnim: { stop: () => void } | null = null;
let resolveTransitionDone: (() => void) | null = null;
let pendingRafIds: number[] = [];
let outTimer: number | null = null;

// ── Reveal (initial page load) ───────────────────────────────────────────────

export function revealContent() {
  const el = contentEl.value;
  if (el) el.style.opacity = "1";
}

// ── Navigate with transition ─────────────────────────────────────────────────

const OUT_DURATION = 180;

export function navigateTab(
  newPath: string,
  currentPath: string,
  routeFn: (path: string) => void
) {
  const oldIdx = getTabIndex(currentPath);
  const newIdx = getTabIndex(newPath);
  const el = contentEl.value;

  if (oldIdx === newIdx || oldIdx < 0 || newIdx < 0 || !el) {
    routeFn(newPath);
    return;
  }

  cancelAll(el);

  const dir = newIdx > oldIdx ? 1 : -1;
  pendingDirection.value = dir;

  transitionDone.value = new Promise<void>((resolve) => {
    resolveTransitionDone = resolve;
  });

  // OUT: CSS transition
  const outX = `${dir * -15}%`;
  el.style.transition = `opacity ${OUT_DURATION}ms ease-out, transform ${OUT_DURATION}ms ease-out`;
  el.style.opacity = "0";
  el.style.transform = `translateX(${outX})`;

  outTimer = window.setTimeout(() => {
    outTimer = null;
    el.style.transition = "";
    el.style.transform = `translateX(${dir * 30}%)`;
    // opacity is already "0" inline — matches CSS class
    routeFn(newPath);
  }, OUT_DURATION);
}

/**
 * Called by Shell after route change. Double-rAF before animation.
 */
export function animateIn(): Promise<void> {
  const dir = pendingDirection.value;
  const el = contentEl.value;

  if (dir === 0 || !el) {
    if (resolveTransitionDone) { resolveTransitionDone(); resolveTransitionDone = null; }
    return Promise.resolve();
  }

  pendingDirection.value = 0;

  const fromX = `${dir * 30}%`;
  el.style.transform = `translateX(${fromX})`;

  const id1 = requestAnimationFrame(() => {
    const id2 = requestAnimationFrame(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAnim = (animate as any)(
        el,
        { opacity: [0, 1], transform: [`translateX(${fromX})`, `translateX(0%)`] },
        { type: "spring", stiffness: 400, damping: 35 }
      );

      (inAnim as any).then(() => {
        inAnim = null;
        if (el) {
          el.style.transform = "";
          el.style.opacity = "1";
        }
        if (resolveTransitionDone) { resolveTransitionDone(); resolveTransitionDone = null; }
      });
    });
    pendingRafIds.push(id2);
  });
  pendingRafIds.push(id1);

  return transitionDone.value ?? Promise.resolve();
}

function cancelAll(el: HTMLElement) {
  if (outTimer !== null) { clearTimeout(outTimer); outTimer = null; }
  if (inAnim) { inAnim.stop(); inAnim = null; }
  for (const id of pendingRafIds) cancelAnimationFrame(id);
  pendingRafIds = [];
  el.style.transition = "";
  el.style.opacity = "1";
  el.style.transform = "";
}
