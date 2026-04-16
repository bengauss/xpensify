import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import { shouldReduceMotion } from "@/lib/animations";

export interface UseCountUpOptions {
  /** Seconds. Default 0.5. */
  duration?: number;
  /** Cubic-bezier tuple or named ease. Default [0.16, 1, 0.3, 1] (easeOutExpo). */
  ease?: [number, number, number, number] | "easeOut" | "easeIn" | "easeInOut" | "linear";
  /** Seconds delay before the count-up starts. Default 0. */
  delay?: number;
  /**
   * Pass `false` to suspend animation (element renders target immediately).
   * Useful for gating behind a tab-transition-ready flag.
   */
  enabled?: boolean;
}

/**
 * Animate a rendered number from the previously-displayed value to `target`.
 * Writes to `el.textContent` via `format(current)` each frame; the element
 * should render a stable DOM node (e.g. a `<span>` with a ref).
 *
 * On subsequent changes to `target`, animates from the last displayed value
 * (not from 0). To force a reset to 0, remount the containing component via
 * a `key` change.
 *
 * Honors `prefers-reduced-motion` by jumping to the target instantly.
 */
export function useCountUp<T extends HTMLElement = HTMLSpanElement>(
  target: number,
  format: (n: number) => string,
  options: UseCountUpOptions = {},
) {
  const { duration = 0.5, ease = [0.16, 1, 0.3, 1], delay = 0, enabled = true } = options;
  const ref = useRef<T | null>(null);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!enabled) {
      // Don't commit prev — we want the first enabled render to animate 0 → target.
      el.textContent = format(0);
      return;
    }

    if (shouldReduceMotion()) {
      el.textContent = format(target);
      prevRef.current = target;
      return;
    }

    const from = prevRef.current;
    if (from === target) {
      el.textContent = format(target);
      return;
    }
    prevRef.current = target;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (animate as any)(from, target, {
      duration,
      ease,
      delay,
      onUpdate: (v: number) => {
        if (ref.current) ref.current.textContent = format(Math.round(v));
      },
    });

    return () => controls.stop();
  }, [target, enabled]);

  return ref;
}
