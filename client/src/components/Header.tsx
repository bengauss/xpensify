import { SyncIndicator } from "@/components/SyncIndicator";

interface HeaderProps {
  onSettingsClick?: () => void;
}

export function Header({ onSettingsClick }: HeaderProps) {
  return (
    <header
      class="relative flex items-center justify-between px-4 py-3 flex-shrink-0"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <div class="flex items-center gap-2">
        <svg
          width="22"
          height="22"
          viewBox="0 0 1024 1024"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g transform="translate(512 512)">
            <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(45)" fill="#6c9cff" />
            <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(135)" fill="#69db7c" />
            <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(225)" fill="#ff6b6b" />
            <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(315)" fill="#9775fa" />
          </g>
        </svg>
        <span
          style={{
            color: "var(--color-text-primary)",
            fontSize: 17,
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          xpensify
        </span>
      </div>
      <div class="flex items-center gap-3">
        <SyncIndicator />
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            class="flex h-8 w-8 items-center justify-center rounded-full opacity-50 hover:opacity-80"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-primary)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
      {/* Soft gradient hairline so the header separates from scrolling content. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 0,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.05) 22%, rgba(255,255,255,0.05) 78%, transparent)",
        }}
      />
    </header>
  );
}
