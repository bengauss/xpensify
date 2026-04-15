import { useLocation } from "preact-iso";
import { navigateTab } from "@/lib/transitions";

const tabs = [
  { path: "/", icon: "M12 5v14M5 12h14" },
  { path: "/history", icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { path: "/recurring", icon: "M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15.36-4.36L20 5M20 15a9 9 0 0 1-15.36 4.36L4 19" },
  { path: "/analytics", icon: "M18 20V10M12 20V4M6 20v-6" },
] as const;

export function BottomNav() {
  const { path, route } = useLocation();

  function handleClick(e: Event, tabPath: string) {
    e.preventDefault();
    if (tabPath === path) return;
    navigateTab(tabPath, path, route);
  }

  return (
    <nav
      class="fixed bottom-0 left-0 right-0 mx-auto max-w-[480px] z-40 flex items-center justify-around border-t border-text-ghost/10 bg-bg-primary px-2 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }}
    >
      {tabs.map((tab) => {
        const active = path === tab.path;
        return (
          <a
            key={tab.path}
            href={tab.path}
            onClick={(e) => handleClick(e, tab.path)}
            class="flex items-center justify-center px-6 py-2"
          >
            <div
              class={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-accent/15" : ""}`}
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
            </div>
          </a>
        );
      })}
    </nav>
  );
}
