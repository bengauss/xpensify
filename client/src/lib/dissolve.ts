import { shouldReduceMotion } from "@/lib/animations";

export const DISSOLVE_FILTER_ID = "row-dissolve";

const DURATION_MS = 450;
const MAX_DISPLACEMENT = 140;
const OPACITY_HOLD = 0.25;
const COLLAPSE_START = 0.55;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function ensureFilterEl(): SVGFEDisplacementMapElement | null {
  const filter = document.getElementById(DISSOLVE_FILTER_ID);
  if (!filter) return null;
  const turbulence = filter.querySelector("feTurbulence");
  const displacement = filter.querySelector("feDisplacementMap");
  if (!turbulence || !displacement) return null;
  turbulence.setAttribute("seed", String(Math.floor(Math.random() * 1000)));
  displacement.setAttribute("scale", "0");
  return displacement as SVGFEDisplacementMapElement;
}

export function dissolveRow(el: HTMLElement): Promise<void> {
  const startHeight = el.offsetHeight;
  const startMarginTop = parseFloat(getComputedStyle(el).marginTop) || 0;
  const startMarginBottom = parseFloat(getComputedStyle(el).marginBottom) || 0;

  if (shouldReduceMotion()) {
    return reducedMotionFallback(el, startHeight, startMarginTop, startMarginBottom);
  }

  const displacement = ensureFilterEl();
  if (!displacement) {
    return reducedMotionFallback(el, startHeight, startMarginTop, startMarginBottom);
  }

  el.style.filter = `url(#${DISSOLVE_FILTER_ID})`;
  el.style.willChange = "opacity, filter, max-height";
  el.style.overflow = "hidden";
  el.style.maxHeight = `${startHeight}px`;

  return new Promise<void>((resolve) => {
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);

      const scale = easeOutCubic(progress) * MAX_DISPLACEMENT;
      displacement.setAttribute("scale", scale.toFixed(2));

      const opacity =
        progress < OPACITY_HOLD
          ? 1
          : 1 - easeOutCubic((progress - OPACITY_HOLD) / (1 - OPACITY_HOLD));
      el.style.opacity = opacity.toFixed(3);

      if (progress >= COLLAPSE_START) {
        const collapseProgress = (progress - COLLAPSE_START) / (1 - COLLAPSE_START);
        const eased = easeOutCubic(collapseProgress);
        el.style.maxHeight = `${startHeight * (1 - eased)}px`;
        el.style.marginTop = `${startMarginTop * (1 - eased)}px`;
        el.style.marginBottom = `${startMarginBottom * (1 - eased)}px`;
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        displacement.setAttribute("scale", "0");
        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

function reducedMotionFallback(
  el: HTMLElement,
  startHeight: number,
  startMarginTop: number,
  startMarginBottom: number
): Promise<void> {
  el.style.overflow = "hidden";
  el.style.transition = "opacity 150ms ease, max-height 150ms ease, margin 150ms ease";
  el.style.maxHeight = `${startHeight}px`;
  el.style.marginTop = `${startMarginTop}px`;
  el.style.marginBottom = `${startMarginBottom}px`;
  requestAnimationFrame(() => {
    el.style.opacity = "0";
    el.style.maxHeight = "0px";
    el.style.marginTop = "0px";
    el.style.marginBottom = "0px";
  });
  return new Promise((resolve) => setTimeout(resolve, 160));
}
