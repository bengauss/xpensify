import { useState, useRef, useEffect } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { useLocation } from "preact-iso";
import { AddScreen } from "@/screens/Add";
import {
  pendingDirection,
  isTransitioning,
  completeTransition,
} from "@/lib/transitions";

// Keep AddScreen (the default landing) eager; lazy-load everything else to
// shrink the main bundle on cold start.
const HistoryScreen = lazy(() => import("@/screens/History"));
const RecurringScreen = lazy(() => import("@/screens/Recurring"));
const RecurringForm = lazy(() => import("@/screens/RecurringForm"));
const SettingsScreen = lazy(() => import("@/screens/Settings"));
const SettingsCategoriesScreen = lazy(() => import("@/screens/SettingsCategories"));
const AnalyticsScreen = lazy(() => import("@/screens/Analytics"));

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
  return <AddScreen />;
}

// ── TabTransitionContainer ──────────────────────────────────────────────────

interface Slot {
  path: string;
  key: number;
}

export function TabTransitionContainer() {
  const { path } = useLocation();

  const [slots, setSlots] = useState<(Slot | null)[]>([
    { path, key: 0 },
    null,
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  const layer0Ref = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layerRefs = [layer0Ref, layer1Ref];

  const prevPathRef = useRef(path);
  const nextKeyRef = useRef(1);
  const activeIdxRef = useRef(activeIdx);
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

      // Step 1: Outgoing layer — set exit transform, remove active class.
      // CSS transition handles opacity (1 → 0, from .active → base) and
      // transform (0 → exit). Starts immediately, no frame gap.
      outLayer.style.transform = `translateX(${dir === 1 ? "-15%" : "15%"})`;
      outLayer.classList.remove("active");

      // Step 2: Incoming layer — place at starting position WITHOUT transition.
      inLayer.style.transition = "none";
      inLayer.style.transform = `translateX(${dir === 1 ? "30%" : "-30%"})`;
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
      void outLayer.offsetHeight;
      outLayer.style.transition = "";
    }
    if (inLayer) {
      inLayer.style.transition = "none";
      inLayer.style.transform = "";
      inLayer.classList.add("active");
      void inLayer.offsetHeight;
      inLayer.style.transition = "";
    }

    // Trigger the cleanup so state catches up
    inFlight.cleanup();
  }

  return (
    <main class="transition-container">
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
