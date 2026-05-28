import { useEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { getTabIndex, isTransitioning, navigateTab } from "@/lib/transitions";
import { sync } from "@/sync/engine";
import { syncStatus } from "@/sync/status";

const TAB_PATHS = ["/", "/history", "/recurring", "/analytics"];

const INTENT_THRESHOLD = 12;
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 0.4;
const PTR_THRESHOLD = 70;
const PTR_RESISTANCE = 0.45;
const PTR_MAX_PULL = 120;

type Intent = "none" | "horizontal" | "vertical" | "scroll";

function hasScrollableXAncestor(el: HTMLElement | null, stopAt: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== stopAt) {
    if (node.scrollWidth > node.clientWidth) {
      const style = getComputedStyle(node);
      const ox = style.overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Attach pull-to-refresh and horizontal tab-swipe gestures to the
 * TabTransitionContainer. The active scroll layer is resolved dynamically
 * each touchstart so we always query the correct scrollTop.
 *
 * - Horizontal swipe → previous/next tab via navigateTab().
 *   Skipped if the touch originated inside an element that has its own
 *   horizontal scroll (e.g. the trend chart).
 * - Vertical pull from scrollTop=0 → sync(). Shows an indicator that
 *   follows the finger with resistance.
 */
export function useTabGestures(
  containerRef: RefObject<HTMLElement>,
  getActiveLayer: () => HTMLElement | null,
  getCurrentPath: () => string,
  routeFn: (path: string) => void,
  indicatorRef: RefObject<HTMLElement>,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startScrollTop = 0;
    let intent: Intent = "none";
    let pullDistance = 0;
    let startInScrollableX = false;
    let pulledLayer: HTMLElement | null = null;

    const resetIndicator = () => {
      const el = indicatorRef.current;
      if (!el) return;
      el.style.transition = "transform 200ms ease-out, opacity 200ms ease-out";
      el.style.transform = "translateY(-100%)";
      el.style.opacity = "0";
    };

    const resetLayer = () => {
      const layer = pulledLayer;
      if (!layer) return;
      layer.style.transition = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
      layer.style.transform = "translateY(0)";
      pulledLayer = null;
    };

    const updateIndicator = (dy: number) => {
      const pull = Math.min(dy * PTR_RESISTANCE, PTR_MAX_PULL);
      pullDistance = pull;

      const layer = getActiveLayer();
      if (layer) {
        pulledLayer = layer;
        layer.style.transition = "none";
        layer.style.transform = `translateY(${pull}px)`;
      }

      const el = indicatorRef.current;
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${pull - 40}px)`;
      el.style.opacity = `${Math.min(pull / PTR_THRESHOLD, 1)}`;
      const spinner = el.querySelector<HTMLElement>("[data-ptr-spinner]");
      if (spinner) {
        const armed = pull >= PTR_THRESHOLD;
        spinner.style.transform = `rotate(${pull * 3}deg)`;
        spinner.style.color = armed ? "var(--color-accent)" : "var(--color-text-tertiary)";
      }
    };

    const handleStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        intent = "scroll";
        return;
      }
      if (isTransitioning.value) {
        intent = "scroll";
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = performance.now();
      const active = getActiveLayer();
      startScrollTop = active?.scrollTop ?? 0;
      startInScrollableX = hasScrollableXAncestor(
        e.target as HTMLElement,
        container,
      );
      intent = "none";
      pullDistance = 0;
    };

    const handleMove = (e: TouchEvent) => {
      if (intent === "scroll") return;
      if (e.touches.length !== 1) {
        intent = "scroll";
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (intent === "none") {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax < INTENT_THRESHOLD && ay < INTENT_THRESHOLD) return;
        if (ax > ay) {
          if (startInScrollableX) {
            intent = "scroll";
            return;
          }
          intent = "horizontal";
        } else if (dy > 0 && startScrollTop <= 0) {
          intent = "vertical";
        } else {
          intent = "scroll";
          return;
        }
      }

      if (intent === "vertical") {
        if (dy <= 0) {
          resetIndicator();
          resetLayer();
          intent = "scroll";
          return;
        }
        e.preventDefault();
        updateIndicator(dy);
      }
      // Horizontal: no visual drag; release triggers navigateTab.
    };

    const handleEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t ? t.clientX - startX : 0;
      const dy = t ? t.clientY - startY : 0;
      const dt = Math.max(performance.now() - startTime, 1);

      if (intent === "horizontal") {
        const vx = Math.abs(dx) / dt;
        const passed = Math.abs(dx) > SWIPE_DISTANCE || vx > SWIPE_VELOCITY;
        if (passed) {
          const path = getCurrentPath();
          const idx = getTabIndex(path);
          if (idx >= 0) {
            const nextIdx = dx < 0 ? idx + 1 : idx - 1;
            if (nextIdx >= 0 && nextIdx < TAB_PATHS.length) {
              navigateTab(TAB_PATHS[nextIdx], path, routeFn);
            }
          }
        }
      } else if (intent === "vertical") {
        const armed = pullDistance >= PTR_THRESHOLD;
        if (armed && syncStatus.value.state !== "syncing") {
          sync().catch(console.error);
        }
        resetIndicator();
        resetLayer();
      }

      intent = "none";
      pullDistance = 0;
    };

    const handleCancel = () => {
      if (intent === "vertical") {
        resetIndicator();
        resetLayer();
      }
      intent = "none";
      pullDistance = 0;
    };

    container.addEventListener("touchstart", handleStart, { passive: true });
    container.addEventListener("touchmove", handleMove, { passive: false });
    container.addEventListener("touchend", handleEnd, { passive: true });
    container.addEventListener("touchcancel", handleCancel, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleStart);
      container.removeEventListener("touchmove", handleMove);
      container.removeEventListener("touchend", handleEnd);
      container.removeEventListener("touchcancel", handleCancel);
    };
  }, []);
}
