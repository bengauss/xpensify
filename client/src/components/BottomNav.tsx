import { useLocation } from "preact-iso";
import { navigateTab } from "@/lib/transitions";
import { usePressScale } from "@/lib/usePressScale";
import { hasUnreviewedAutoSaves } from "@/lib/pending";

const tabs = [
  { path: "/", icon: "M12 5v14M5 12h14" },
  { path: "/history", icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { path: "/recurring", icon: "M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15.36-4.36L20 5M20 15a9 9 0 0 1-15.36 4.36L4 19" },
  { path: "/analytics", icon: "M18 20V10M12 20V4M6 20v-6" },
] as const;

function TabLink({
  tab,
  active,
  onClick,
  showDot,
}: {
  tab: { path: string; icon: string };
  active: boolean;
  onClick: (e: Event) => void;
  showDot?: boolean;
}) {
  const press = usePressScale<HTMLAnchorElement>(0.95);
  return (
    <a
      ref={press.ref}
      href={tab.path}
      onClick={onClick}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      class="flex items-center justify-center px-6 py-2"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        class="flex h-11 w-11 items-center justify-center rounded-full relative"
        style={{
          backgroundColor: active ? "rgba(108,156,255,0.11)" : "transparent",
          boxShadow: active ? "inset 0 0 0 0.5px rgba(108,156,255,0.35)" : "none",
          transition: "background-color 240ms cubic-bezier(0.22,1,0.36,1), box-shadow 240ms ease",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={active ? "var(--color-accent)" : "var(--color-text-body)"}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d={tab.icon} />
        </svg>
        {showDot && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)",
              boxShadow: "0 0 0 1.5px var(--color-bg-primary), 0 0 8px rgba(108,156,255,0.5)",
            }}
          />
        )}
      </div>
    </a>
  );
}

export function BottomNav() {
  const { path, route } = useLocation();

  return (
    <nav
      class="relative flex-shrink-0 z-40 flex items-center justify-around bg-bg-primary px-2 pt-2.5"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
      {/* Fade above the nav so scrolling content dissolves into it rather than
          hitting a hard border. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -28,
          height: 28,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(12,13,18,0) 0%, rgba(12,13,18,0.85) 70%, #0c0d12 100%)",
        }}
      />
      {tabs.map((tab) => (
        <TabLink
          key={tab.path}
          tab={tab}
          active={path === tab.path}
          showDot={tab.path === "/history" && hasUnreviewedAutoSaves.value && path !== "/history"}
          onClick={(e) => {
            e.preventDefault();
            if (tab.path === path) return;
            navigateTab(tab.path, path, route);
          }}
        />
      ))}
    </nav>
  );
}
