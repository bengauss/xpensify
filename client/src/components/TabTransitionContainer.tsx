import { useState, useRef, useEffect } from "preact/hooks";
import { useLocation, lazy } from "preact-iso";
import { animate } from "motion";
import { AddScreen } from "@/screens/Add";
import HistoryScreen from "@/screens/History";
import RecurringScreen from "@/screens/Recurring";
import RecurringForm from "@/screens/RecurringForm";
import SettingsScreen from "@/screens/Settings";
import {
  pendingDirection,
  isTransitioning,
  completeTransition,
} from "@/lib/transitions";

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
  return <AddScreen />;
}

// ── TabTransitionContainer ──────────────────────────────────────────────────

interface Slot {
  path: string;
  key: number;
}

export function TabTransitionContainer() {
  const { path } = useLocation();

  // Two slots — each can hold a Slot or null
  const [slots, setSlots] = useState<(Slot | null)[]>([
    { path, key: 0 },
    null,
  ]);
  // Which slot is currently the active (visible, interactive) one
  const [activeIdx, setActiveIdx] = useState(0);

  const layer0Ref = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layerRefs = [layer0Ref, layer1Ref];

  const prevPathRef = useRef(path);
  const nextKeyRef = useRef(1);

  useEffect(() => {
    if (path === prevPathRef.current) return;
    prevPathRef.current = path;

    const dir = pendingDirection.value;
    pendingDirection.value = 0;

    // Non-tab navigation: just swap content in the active layer (no animation)
    if (dir === 0) {
      setSlots((s) => {
        const next = [...s];
        next[activeIdx] = { path, key: nextKeyRef.current++ };
        return next;
      });
      completeTransition();
      return;
    }

    // Tab transition: crossfade between two layers
    if (isTransitioning.value) {
      // Safety: shouldn't happen because navigateTab blocks, but bail if it does
      setSlots((s) => {
        const next = [...s];
        next[activeIdx] = { path, key: nextKeyRef.current++ };
        return next;
      });
      completeTransition();
      return;
    }

    isTransitioning.value = true;

    const oldIdx = activeIdx;
    const newIdx = 1 - oldIdx;

    // Mount new content into the inactive layer (which is at opacity 0)
    setSlots((s) => {
      const next = [...s];
      next[newIdx] = { path, key: nextKeyRef.current++ };
      return next;
    });

    // After Preact renders, animate both layers
    requestAnimationFrame(() => {
      const outLayer = layerRefs[oldIdx].current;
      const inLayer = layerRefs[newIdx].current;
      if (!outLayer || !inLayer) {
        isTransitioning.value = false;
        completeTransition();
        return;
      }

      const inFromX = dir === 1 ? "30%" : "-30%";
      const outToX = dir === 1 ? "-15%" : "15%";

      // Set incoming layer's starting transform
      inLayer.style.transform = `translateX(${inFromX})`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outAnim = (animate as any)(
        outLayer,
        { opacity: [1, 0], transform: ["translateX(0%)", `translateX(${outToX})`] },
        { duration: 0.2, easing: "ease-out" }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inAnim = (animate as any)(
        inLayer,
        { opacity: [0, 1], transform: [`translateX(${inFromX})`, "translateX(0%)"] },
        { type: "spring", stiffness: 400, damping: 35 }
      );

      Promise.all([outAnim, inAnim].map((a: any) => a)).then(() => {
        // Transition complete: flip activeIdx and unmount old content
        setActiveIdx(newIdx);
        setSlots((s) => {
          const next = [...s];
          next[oldIdx] = null;
          return next;
        });
        isTransitioning.value = false;
        completeTransition();
      });
    });
  }, [path]);

  return (
    <main class="flex-1 relative overflow-hidden pt-2">
      {[0, 1].map((i) => {
        const slot = slots[i];
        const isActive = activeIdx === i;
        return (
          <div
            key={i}
            ref={layerRefs[i]}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isActive ? 1 : 0,
              pointerEvents: isActive ? "auto" : "none",
              overflowY: "auto",
            }}
          >
            {slot && <RouteContent key={slot.key} path={slot.path} />}
          </div>
        );
      })}
    </main>
  );
}
