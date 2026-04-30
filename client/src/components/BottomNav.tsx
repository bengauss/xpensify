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
        class={`flex h-11 w-11 items-center justify-center rounded-full transition-colors relative ${active ? "bg-accent/15" : ""}`}
      >
        <svg
          width="28"
          height="28"
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
              boxShadow: "0 0 0 1.5px var(--color-bg-primary)",
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
      class="flex-shrink-0 z-40 flex items-center justify-around border-t border-text-ghost/10 bg-bg-primary px-2 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
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
