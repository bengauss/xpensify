import { useLocation } from "preact-iso";

const tabs = [
  { path: "/", label: "add", icon: "M12 5v14M5 12h14" },
  { path: "/history", label: "history", icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { path: "/recurring", label: "recurring", icon: "M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15.36-4.36L20 5M20 15a9 9 0 0 1-15.36 4.36L4 19" },
  { path: "/analytics", label: "analytics", icon: "M18 20V10M12 20V4M6 20v-6" },
] as const;

export function BottomNav() {
  const { path } = useLocation();

  return (
    <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-text-ghost/10 bg-bg-primary px-2 pb-[env(safe-area-inset-bottom)] pt-1">
      {tabs.map((tab) => {
        const active = path === tab.path;
        return (
          <a
            key={tab.path}
            href={tab.path}
            class={`flex flex-col items-center gap-1 px-4 py-2 transition-opacity ${active ? "opacity-100" : "opacity-50"}`}
          >
            <div
              class={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${active ? "bg-accent/15" : ""}`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={active ? "var(--color-accent)" : "var(--color-text-primary)"}
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d={tab.icon} />
              </svg>
            </div>
            <span
              class={`text-[10px] font-medium ${active ? "text-accent" : "text-text-primary"}`}
            >
              {tab.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
