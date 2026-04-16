import { useRef, useCallback } from "preact/hooks";
import { animate } from "motion";
import { springs, shouldReduceMotion, getReducedMotionOverride } from "@/lib/animations";

/**
 * Unified tactile press feedback for any tappable element.
 * Scales down on pointerdown, springs back on pointerup/cancel.
 *
 * Spread onto the element:
 *   const press = usePressScale(0.97);
 *   <button ref={press.ref} onPointerDown={press.onPointerDown} onPointerUp={press.onPointerUp} onPointerCancel={press.onPointerCancel}>
 *
 * `pointercancel` is used (not `pointerleave`) so a finger sliding off mid-press
 * doesn't chop the scale-back — the OS fires pointercancel when gesture
 * recognition steals the event, which is the correct moment to reset.
 */
export function usePressScale<T extends HTMLElement = HTMLButtonElement>(
  scale = 0.97,
) {
  const ref = useRef<T | null>(null);

  const onPointerDown = useCallback(() => {
    const el = ref.current;
    if (!el || shouldReduceMotion()) return;
    el.style.transition = "transform 100ms ease";
    el.style.transform = `scale(${scale})`;
  }, [scale]);

  const onPointerUp = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "";
    if (shouldReduceMotion()) {
      el.style.transform = "";
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(el, { scale: 1 }, { ...springs.snappy, ...getReducedMotionOverride() });
  }, []);

  return {
    ref,
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
