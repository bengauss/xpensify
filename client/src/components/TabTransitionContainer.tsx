import { useState, useRef, useEffect } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { useLocation } from "preact-iso";
import { AddScreen } from "@/screens/Add";
import {
  pendingDirection,
  isTransitioning,
  completeTransition,
} from "@/lib/transitions";
import { useTabGestures } from "@/lib/gestures";

// Keep AddScreen (the default landing) eager; lazy-load everything else to
// shrink the main bundle on cold start.
const HistoryScreen = lazy(() => import("@/screens/History"));
const RecurringScreen = lazy(() => import("@/screens/Recurring"));
const RecurringForm = lazy(() => import("@/screens/RecurringForm"));
const SettingsScreen = lazy(() => import("@/screens/Settings"));
const SettingsCategoriesScreen = lazy(() => import("@/screens/SettingsCategories"));
const AnalyticsScreen = lazy(() => import("@/screens/Analytics"));
const ConfirmScreen = lazy(() => import("@/screens/Confirm"));

// ── RouteContent: manual path → component mapping ──────────────────────────

function RouteContent({ path }: { path: string }) {
  if (path === "/") return <AddScreen />;
  if (path === "/history") return <HistoryScreen />;
  if (path === "/recurring") return <RecurringScreen />;
  if (path === "/recurring/new") return <RecurringForm />;
  if (path.startsWith("/recurring/edit/")) {
    const id = path.split("/").pop();
    return <RecurringForm id={id} />;
  }
  if (path === "/analytics") return <AnalyticsScreen />;
  if (path === "/settings") return <SettingsScreen />;
  if (path === "/settings/categories") return <SettingsCategoriesScreen />;
  if (path === "/confirm") return <ConfirmScreen />;
  return <AddScreen />;
}

// ── TabTransitionContainer ──────────────────────────────────────────────────

interface Slot {
  path: string;
  key: number;
}

export function TabTransitionContainer() {
  const { path, route } = useLocation();

  const [slots, setSlots] = useState<(Slot | null)[]>([
    { path, key: 0 },
    null,
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  const containerRef = useRef<HTMLElement>(null);
  const layer0Ref = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layerRefs = [layer0Ref, layer1Ref];
  const ptrIndicatorRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const prevPathRef = useRef(path);
  const nextKeyRef = useRef(1);
  const activeIdxRef = useRef(activeIdx);

  useTabGestures(
    containerRef,
    () => layerRefs[activeIdxRef.current].current,
    () => pathRef.current,
    route,
    ptrIndicatorRef,
  );
  const inFlightRef = useRef<{
    oldIdx: number;
    newIdx: number;
    cleanup: () => void;
  } | null>(null);

  // Keep activeIdxRef in sync for use in effects/callbacks
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  useEffect(() => {
    if (path === prevPathRef.current) return;
    prevPathRef.current = path;

    const dir = pendingDirection.value;
    pendingDirection.value = 0;

    // Non-tab navigation: swap content in active layer (no animation)
    if (dir === 0) {
      // If mid-transition, fast-forward first
      if (inFlightRef.current) fastForward();

      setSlots((s) => {
        const next = [...s];
        next[activeIdxRef.current] = { path, key: nextKeyRef.current++ };
        return next;
      });
      completeTransition();
      return;
    }

    // Tab transition — fast-forward any in-flight transition first
    if (inFlightRef.current) fastForward();

    const oldIdx = activeIdxRef.current;
    const newIdx = 1 - oldIdx;

    isTransitioning.value = true;

    // Mount new content in inactive layer. JSX will render it at opacity 0
    // (no `active` class on the inactive layer), so it mounts invisibly.
    setSlots((s) => {
      const next = [...s];
      next[newIdx] = { path, key: nextKeyRef.current++ };
      return next;
    });

    // After Preact commits the render, run the CSS transition
    requestAnimationFrame(() => {
      const outLayer = layerRefs[oldIdx].current;
      const inLayer = layerRefs[newIdx].current;
      if (!outLayer || !inLayer) {
        isTransitioning.value = false;
        completeTransition();
        return;
      }

      // Promote both layers to their own GPU layer for the duration of the
      // transition. Removed in cleanup so idle tabs don't hold layer memory.
      outLayer.classList.add("transitioning");
      inLayer.classList.add("transitioning");

      // Step 1: Outgoing layer — set exit transform, remove active class.
      // CSS transition handles opacity (1 → 0, from .active → base) and
      // transform (0 → exit). Starts immediately, no frame gap.
      // Smaller distances (8% out, 15% in) read as a peek rather than a
      // full sideways slide — premium apps use subtler spatial shifts.
      outLayer.style.transform = `translateX(${dir === 1 ? "-8%" : "8%"})`;
      outLayer.classList.remove("active");

      // Step 2: Incoming layer — place at starting position WITHOUT transition.
      inLayer.style.transition = "none";
      inLayer.style.transform = `translateX(${dir === 1 ? "15%" : "-15%"})`;
      // Force layout to commit the starting state in this frame.
      void inLayer.offsetHeight;

      // Step 3: Re-enable transition, activate. CSS transition animates
      // from the committed start state to the active state in ONE frame.
      inLayer.style.transition = "";
      inLayer.style.transform = "translateX(0)";
      inLayer.classList.add("active");

      // Cleanup when the incoming layer's transition ends
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== inLayer) return; // ignore bubbled events
        if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
        cleanup();
      };
      inLayer.addEventListener("transitionend", onEnd);

      // Fallback timer in case transitionend doesn't fire
      const fallbackTimer = window.setTimeout(cleanup, 400);

      function cleanup() {
        inLayer!.removeEventListener("transitionend", onEnd);
        clearTimeout(fallbackTimer);
        inFlightRef.current = null;

        // Clear inline transforms so the layers don't create a `transform`
        // containing block — otherwise `position: fixed` descendants (floating
        // action buttons) get trapped inside the layer instead of the viewport.
        if (outLayer) outLayer.style.transform = "";
        if (inLayer) inLayer.style.transform = "";

        // Demote layers from GPU compositing shortly after the transition
        // ends so idle tabs don't permanently hold a layer reserved. The
        // 100ms cushion avoids thrashing on rapid back-to-back tab taps.
        window.setTimeout(() => {
          if (outLayer) outLayer.classList.remove("transitioning");
          if (inLayer) inLayer.classList.remove("transitioning");
        }, 100);

        // Update state: new layer is active, old content unmounted
        setActiveIdx(newIdx);
        setSlots((s) => {
          const next = [...s];
          next[oldIdx] = null;
          return next;
        });
        isTransitioning.value = false;
        completeTransition();
      }

      inFlightRef.current = { oldIdx, newIdx, cleanup };
    });
  }, [path]);

  /**
   * Fast-forward any in-flight transition to its end state.
   * Used when a new tab is tapped mid-transition.
   */
  function fastForward() {
    const inFlight = inFlightRef.current;
    if (!inFlight) return;

    const outLayer = layerRefs[inFlight.oldIdx].current;
    const inLayer = layerRefs[inFlight.newIdx].current;

    if (outLayer) {
      outLayer.style.transition = "none";
      outLayer.style.transform = "";
      outLayer.classList.remove("active");
      outLayer.classList.remove("transitioning");
      void outLayer.offsetHeight;
      outLayer.style.transition = "";
    }
    if (inLayer) {
      inLayer.style.transition = "none";
      inLayer.style.transform = "";
      inLayer.classList.add("active");
      inLayer.classList.remove("transitioning");
      void inLayer.offsetHeight;
      inLayer.style.transition = "";
    }

    // Trigger the cleanup so state catches up
    inFlight.cleanup();
  }

  return (
    <main ref={containerRef} class="transition-container">
      <div
        ref={ptrIndicatorRef}
        class="ptr-indicator"
        aria-hidden="true"
        style={{ transform: "translateY(-100%)", opacity: 0 }}
      >
        <svg
          data-ptr-spinner
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <path d="M21 12a9 9 0 1 1-6.2-8.55" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </div>
      {[0, 1].map((i) => {
        const slot = slots[i];
        const isActive = activeIdx === i;
        return (
          <div
            key={i}
            ref={layerRefs[i]}
            class={`transition-layer ${isActive ? "active" : ""}`}
          >
            {slot && (
              <Suspense fallback={null}>
                <RouteContent key={slot.key} path={slot.path} />
              </Suspense>
            )}
          </div>
        );
      })}
    </main>
  );
}
