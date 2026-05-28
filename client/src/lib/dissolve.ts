import { shouldReduceMotion } from "@/lib/animations";

export function fadeRemoveRow(el: HTMLElement): Promise<void> {
  const rect = el.getBoundingClientRect();
  const startHeight = rect.height;
  const duration = shouldReduceMotion() ? 120 : 320;

  el.style.boxSizing = "border-box";
  el.style.overflow = "hidden";
  el.style.minHeight = "0";
  el.style.height = `${startHeight}px`;
  el.style.paddingTop = "10px";
  el.style.paddingBottom = "10px";
  el.style.willChange = "opacity, height, padding";
  // Force a reflow so the from-values are observed by the transition.
  void el.offsetHeight;

  el.style.transition = `opacity ${duration}ms ease, height ${duration}ms ease, padding ${duration}ms ease`;
  el.style.opacity = "0";
  el.style.height = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("transitionend", onEnd);
      // Leave the row in flow at height:0/padding:0/opacity:0 — the caller's
      // follow-up Dexie unmount carries it away on the next render. Removing
      // the row from flow here (display) would shrink the parent layout in a
      // separate step from the height transition and snap siblings upward.
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== "height") return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    // Fallback in case transitionend is suppressed (reduced motion, tab
    // backgrounded mid-animation).
    setTimeout(finish, duration + 60);
  });
}
