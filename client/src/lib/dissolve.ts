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
    const finish = () => {
      // Remove from layout before the liveQuery-driven unmount so there is
      // no sub-pixel snap when the DOM node disappears.
      el.style.display = "none";
      resolve();
    };
    setTimeout(finish, duration + 20);
  });
}
