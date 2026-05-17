import { useEffect, useRef } from "preact/hooks";
import { stagger, MOUNT_DELAY_MS, shouldReduceMotion } from "@/lib/animations";
import { transitionDone } from "@/lib/transitions";

const MAX_ANIMATED_ROWS = 15; // only animate above-the-fold

/**
 * Hook that runs an entrance animation after mount + optional tab transition.
 * Returns a cancel function ref that screens should call on unmount.
 */
export function useEntrance(
  callback: () => (() => void) | void,
  deps: unknown[] = []
) {
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    function run() {
      if (cancelled) return;
      const cleanup = callback();
      if (cleanup) cancelRef.current = cleanup;
    }

    const mountDelay = shouldReduceMotion() ? 0 : MOUNT_DELAY_MS;
    const pending = transitionDone.value;
    if (pending) {
      pending.then(() => {
        if (cancelled) return;
        const timer = setTimeout(run, mountDelay);
        cancelRef.current = () => { clearTimeout(timer); cancelled = true; };
      });
    } else {
      const timer = setTimeout(run, mountDelay);
      cancelRef.current = () => { clearTimeout(timer); cancelled = true; };
    }

    return () => {
      cancelled = true;
      if (cancelRef.current) cancelRef.current();
    };
  }, deps);
}

/**
 * Animate a list of rows with text-slide-in + amount-fade-in.
 * Each row element should contain [data-row-text] and [data-row-amount] children.
 * Idempotent + re-entrant: rows marked [data-revealed] are skipped, so callers
 * can re-run after data growth (infinite scroll, filter changes) to cover new
 * rows without re-animating already-visible ones.
 */
export function animateRowEntrance(container: HTMLElement): () => void {
  const allRows = Array.from(container.querySelectorAll<HTMLElement>("[data-row]"));

  const unrevealed = allRows.filter((r) => {
    const t = r.querySelector<HTMLElement>("[data-row-text]");
    return !t || !t.hasAttribute("data-revealed");
  });

  if (unrevealed.length === 0) return () => {};

  const isIncremental = unrevealed.length !== allRows.length;

  // Incremental calls (rows added after the initial entrance already played):
  // reveal instantly without animation — the user has already seen the staggered
  // entrance once, and these rows likely appear below the fold or off-screen.
  if (isIncremental) {
    for (const row of unrevealed) {
      row.querySelector<HTMLElement>("[data-row-text]")?.setAttribute("data-revealed", "1");
      row.querySelector<HTMLElement>("[data-row-amount]")?.setAttribute("data-revealed", "1");
    }
    return () => {};
  }

  // Reduced-motion: reveal without staggered animation.
  if (shouldReduceMotion()) {
    for (const row of unrevealed) {
      row.querySelector<HTMLElement>("[data-row-text]")?.setAttribute("data-revealed", "1");
      row.querySelector<HTMLElement>("[data-row-amount]")?.setAttribute("data-revealed", "1");
    }
    return () => {};
  }

  const timers: number[] = [];
  const animatedTextEls: HTMLElement[] = [];
  const animatedAmountEls: HTMLElement[] = [];
  const count = Math.min(unrevealed.length, MAX_ANIMATED_ROWS);
  const textStaggerMs = stagger.text * 1000;
  const amountStaggerMs = stagger.amount * 1000;

  // Phase 1: text slides in from left for the first `count` rows. We use a
  // setTimeout + CSS transition (same pattern as Phase 2 amounts) rather than
  // motion's spring — the WAAPI-backed spring silently drops on iOS PWA cold-
  // start deep-links from a push notification, stranding rows at opacity:0
  // while amounts revealed normally. CSS transitions are honoured even when
  // the page is mid cold-start work.
  for (let i = 0; i < count; i++) {
    const textEl = unrevealed[i].querySelector<HTMLElement>("[data-row-text]");
    if (!textEl) continue;
    // Pin inline style BEFORE flipping data-revealed so the CSS handoff
    // doesn't flash opacity:1 before the transition starts.
    textEl.style.opacity = "0";
    textEl.style.transform = "translateX(-20px)";
    textEl.setAttribute("data-revealed", "1");
    animatedTextEls.push(textEl);
    const delay = i * textStaggerMs;
    const t = window.setTimeout(() => {
      textEl.style.transition =
        "opacity 280ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
      textEl.style.opacity = "1";
      textEl.style.transform = "";
    }, delay);
    timers.push(t);
  }

  // Rows beyond the animation window: reveal instantly.
  for (let i = count; i < unrevealed.length; i++) {
    unrevealed[i].querySelector<HTMLElement>("[data-row-text]")?.setAttribute("data-revealed", "1");
  }

  // Phase 2: amounts fade in after text settles.
  const textSettleTime = count * textStaggerMs + 200; // ms
  for (let i = 0; i < count; i++) {
    const amountEl = unrevealed[i].querySelector<HTMLElement>("[data-row-amount]");
    if (!amountEl) continue;
    amountEl.style.opacity = "0";
    amountEl.setAttribute("data-revealed", "1");
    animatedAmountEls.push(amountEl);
    const delay = textSettleTime + i * amountStaggerMs;
    const t = window.setTimeout(() => {
      amountEl.style.transition = "opacity 100ms ease";
      amountEl.style.opacity = "1";
    }, delay);
    timers.push(t);
  }

  for (let i = count; i < unrevealed.length; i++) {
    unrevealed[i].querySelector<HTMLElement>("[data-row-amount]")?.setAttribute("data-revealed", "1");
  }

  return () => {
    for (const t of timers) clearTimeout(t);
    // Snap mid-animation elements to their final visible state so rapid
    // re-renders (dep changes in useEntrance) don't leave rows stuck partial.
    for (const el of animatedTextEls) {
      el.style.opacity = "1";
      el.style.transform = "";
    }
    for (const el of animatedAmountEls) {
      el.style.opacity = "1";
    }
  };
}
