import { useEffect, useRef } from "preact/hooks";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { transitionDone } from "@/lib/transitions";

const MOUNT_DELAY = 80; // ms after mount/transition before entrance starts
const TEXT_STAGGER = 30; // ms between row text animations
const AMOUNT_STAGGER = 20; // ms between row amount animations
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

    const pending = transitionDone.value;
    if (pending) {
      pending.then(() => {
        if (cancelled) return;
        const timer = setTimeout(run, MOUNT_DELAY);
        cancelRef.current = () => { clearTimeout(timer); cancelled = true; };
      });
    } else {
      const timer = setTimeout(run, MOUNT_DELAY);
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
 * Returns a cleanup function.
 */
export function animateRowEntrance(container: HTMLElement): () => void {
  const rows = container.querySelectorAll<HTMLElement>("[data-row]");
  const count = Math.min(rows.length, MAX_ANIMATED_ROWS);
  const anims: { stop: () => void }[] = [];
  const timers: number[] = [];

  // Set initial hidden state on rows we'll animate (rows render visible by default)
  for (let i = 0; i < count; i++) {
    const textEl = rows[i].querySelector<HTMLElement>("[data-row-text]");
    const amountEl = rows[i].querySelector<HTMLElement>("[data-row-amount]");
    if (textEl) { textEl.style.opacity = "0"; textEl.style.transform = "translateX(-20px)"; }
    if (amountEl) { amountEl.style.opacity = "0"; }
  }

  // Phase 1: text slides in from left
  for (let i = 0; i < count; i++) {
    const textEl = rows[i].querySelector<HTMLElement>("[data-row-text]");
    if (textEl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (animate as any)(
        textEl,
        { opacity: [0, 1], x: [-20, 0] },
        { ...springs.snappy, delay: i * TEXT_STAGGER / 1000 }
      );
      anims.push(a);
    }
  }

  // Phase 2: amounts fade in after text settles
  const textSettleTime = (count * TEXT_STAGGER + 200); // ms
  for (let i = 0; i < count; i++) {
    const amountEl = rows[i].querySelector<HTMLElement>("[data-row-amount]");
    if (amountEl) {
      const delay = textSettleTime + i * AMOUNT_STAGGER;
      const t = window.setTimeout(() => {
        amountEl.style.transition = "opacity 100ms ease";
        amountEl.style.opacity = "1";
      }, delay);
      timers.push(t);
    }
  }

  return () => {
    for (const a of anims) a.stop();
    for (const t of timers) clearTimeout(t);
  };
}
