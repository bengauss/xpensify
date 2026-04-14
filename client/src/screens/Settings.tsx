import { useState, useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { toChildArray } from "preact";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { currentUser, logout } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { MONTHS_SHORT } from "@/lib/format";

// ── Shared primitives ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  const rows = toChildArray(children);
  return (
    <section
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
      }}
    >
      <div class="px-4 pt-3 pb-3">
        <span class="text-xs font-semibold lowercase" style={{ color: "var(--color-text-tertiary)" }}>
          {title}
        </span>
      </div>
      {rows.map((row, i) => (
        <div key={i}>
          {i > 0 && (
            <div
              style={{
                marginLeft: 16,
                borderTop: "0.5px solid rgba(255,255,255,0.04)",
              }}
            />
          )}
          {row}
        </div>
      ))}
    </section>
  );
}

function Row({
  onClick,
  children,
  danger = false,
}: {
  onClick?: () => void;
  children: ComponentChildren;
  danger?: boolean;
}) {
  const tappable = !!onClick;
  return (
    <div
      onClick={onClick}
      onPointerDown={tappable ? (e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0.7"; } : undefined}
      onPointerUp={tappable ? (e) => { (e.currentTarget as HTMLDivElement).style.opacity = ""; } : undefined}
      onPointerLeave={tappable ? (e) => { (e.currentTarget as HTMLDivElement).style.opacity = ""; } : undefined}
      class="flex items-center gap-3"
      style={{
        padding: "12px 16px",
        minHeight: 48,
        cursor: tappable ? "pointer" : "default",
        color: danger ? "var(--color-danger)" : "var(--color-text-body)",
        WebkitTapHighlightColor: "transparent",
        transition: "opacity 120ms ease",
      }}
    >
      {children}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-hint)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      class="relative flex-shrink-0 rounded-full border-0 p-0 cursor-pointer"
      style={{
        width: 40,
        height: 24,
        backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
        transition: "background-color 150ms ease",
      }}
      aria-label={active ? "disable" : "enable"}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          backgroundColor: "white",
          transform: active ? "translateX(16px)" : "translateX(0)",
          transition: "transform 150ms ease",
        }}
      />
    </button>
  );
}

// ── Categories row (collapsed) ───────────────────────────────────────────────

function CategoriesRow({ onTap }: { onTap: () => void }) {
  const count = useLiveQuery(() => db.categories.count(), []) ?? 0;
  return (
    <Row onClick={onTap}>
      <div
        class="flex-shrink-0 flex items-center justify-center rounded-lg"
        style={{ width: 28, height: 28, backgroundColor: "rgba(108,156,255,0.12)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </div>
      <span class="flex-1 text-sm">categories</span>
      <span class="text-sm tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{count}</span>
      <Chevron />
    </Row>
  );
}

// ── Account section ──────────────────────────────────────────────────────────

function PasswordChangeForm({ onDone }: { onDone: () => void }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setMsg(""); setError(""); setSaving(true);
    try {
      const res = await api.api.auth["change-password"].$post({ json: { current_password: currentPw, new_password: newPw } });
      if (res.ok) {
        setMsg("password updated");
        setCurrentPw(""); setNewPw("");
        setTimeout(onDone, 600);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error?.toLowerCase() ?? "failed to change password");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="flex flex-col gap-2 px-4 pb-3">
      <input
        type="password"
        placeholder="current password"
        value={currentPw}
        onInput={(e) => setCurrentPw((e.target as HTMLInputElement).value)}
        class="rounded-lg bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none border border-text-ghost/20"
      />
      <input
        type="password"
        placeholder="new password"
        value={newPw}
        onInput={(e) => setNewPw((e.target as HTMLInputElement).value)}
        class="rounded-lg bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none border border-text-ghost/20"
      />
      {error && <p class="text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
      {msg && <p class="text-xs" style={{ color: "#30d158" }}>{msg}</p>}
      <div class="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !currentPw || !newPw}
          class="rounded-lg px-4 py-2 text-xs font-medium text-white cursor-pointer border-0"
          style={{ backgroundColor: "var(--color-accent)", opacity: saving || !currentPw || !newPw ? 0.6 : 1 }}
        >
          {saving ? "saving..." : "save"}
        </button>
        <button
          onClick={onDone}
          class="rounded-lg px-4 py-2 text-xs cursor-pointer bg-transparent border-0"
          style={{ color: "var(--color-text-secondary)" }}
        >
          cancel
        </button>
      </div>
    </div>
  );
}

function AccountSection() {
  const user = currentUser.value;
  const [expanded, setExpanded] = useState(false);

  return (
    <Section title="account">
      <div>
        <Row onClick={() => setExpanded((v) => !v)}>
          <div
            class="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ width: 24, height: 24, backgroundColor: user?.avatar_color ?? "#6c9cff" }}
          >
            {user?.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span class="flex-1 text-sm">{user?.display_name ?? "—"}</span>
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {expanded ? "cancel" : "change password"}
          </span>
          {!expanded && <Chevron />}
        </Row>
        {expanded && <PasswordChangeForm onDone={() => setExpanded(false)} />}
      </div>
    </Section>
  );
}

// ── Notifications section ────────────────────────────────────────────────────

interface PushPrefs {
  daily_reminder: number;
  daily_reminder_time: string;
  weekly_summary: number;
  weekly_summary_day: number;
  weekly_summary_time: string;
}

const DAYS_SHORT = ["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"];

function NotificationsSection() {
  const [prefs, setPrefs] = useState<PushPrefs>({
    daily_reminder: 0,
    daily_reminder_time: "21:00",
    weekly_summary: 0,
    weekly_summary_day: 0,
    weekly_summary_time: "09:00",
  });
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    api.api.push.preferences.$get()
      .then((r) => r.ok ? r.json() : null)
      .then((data: unknown) => { if (data) setPrefs(data as PushPrefs); })
      .catch(() => {});
  }, []);

  async function savePrefs(updated: Partial<PushPrefs>) {
    const next = { ...prefs, ...updated };
    setPrefs(next);
    await api.api.push.preferences.$put({ json: next }).catch(() => {});
  }

  async function requestPermission() {
    if (permission === "granted") return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted" && vapidKey) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await api.api.push.subscribe.$post({ json: sub.toJSON() });
      } catch {
        /* subscription best-effort */
      }
    }
  }

  const dailyTime = prefs.daily_reminder_time.slice(0, 5);
  const weeklyDescription = `${DAYS_SHORT[prefs.weekly_summary_day] ?? "sundays"} at ${prefs.weekly_summary_time.slice(0, 5)}`;

  return (
    <Section title="notifications">
      <Row>
        <div class="flex-1 flex flex-col gap-0.5">
          <span class="text-sm">daily reminder</span>
          <span class="text-xs" style={{ color: "var(--color-text-hint)" }}>
            {prefs.daily_reminder ? `at ${dailyTime}, if no expenses logged` : "evening, if no expenses logged"}
          </span>
        </div>
        <Toggle
          active={!!prefs.daily_reminder}
          onToggle={() => savePrefs({ daily_reminder: prefs.daily_reminder ? 0 : 1 })}
        />
      </Row>
      <Row>
        <div class="flex-1 flex flex-col gap-0.5">
          <span class="text-sm">weekly summary</span>
          <span class="text-xs" style={{ color: "var(--color-text-hint)" }}>
            {weeklyDescription}
          </span>
        </div>
        <Toggle
          active={!!prefs.weekly_summary}
          onToggle={() => savePrefs({ weekly_summary: prefs.weekly_summary ? 0 : 1 })}
        />
      </Row>
      <Row onClick={permission !== "granted" ? requestPermission : undefined}>
        <span class="flex-1 text-sm">push permission</span>
        <span
          class="text-sm"
          style={{ color: permission === "granted" ? "#30d158" : "var(--color-text-secondary)" }}
        >
          {permission === "granted" ? "granted" : "not granted"}
        </span>
        {permission !== "granted" && <Chevron />}
      </Row>
    </Section>
  );
}

// ── Data section ─────────────────────────────────────────────────────────────

function DataSection() {
  function handleExport() {
    window.location.href = "/api/export";
  }

  return (
    <Section title="data">
      <Row onClick={handleExport}>
        <span class="flex-1 text-sm">export CSV</span>
        <Chevron />
      </Row>
      <Row>
        <div class="flex-1 flex flex-col gap-0.5">
          <span class="text-sm">import</span>
          <span class="text-xs" style={{ color: "var(--color-text-hint)" }}>
            run server-side: npm run import
          </span>
        </div>
      </Row>
    </Section>
  );
}

// ── Sync section ─────────────────────────────────────────────────────────────

function formatSyncTime(ts: string | null): string {
  if (!ts) return "never";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "never";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function SyncSection() {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setLastSync(localStorage.getItem("xpensify_last_sync"));
  }, []);

  async function handleForceSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncDone(false);
    localStorage.removeItem("xpensify_last_sync");
    try {
      await sync();
      setLastSync(localStorage.getItem("xpensify_last_sync"));
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 1500);
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearCache() {
    await db.expenses.clear();
    await db.categories.clear();
    await db.subcategories.clear();
    await db.recurring_templates.clear();
    localStorage.removeItem("xpensify_last_sync");
    window.location.reload();
  }

  return (
    <Section title="sync">
      <Row>
        <span class="flex-1 text-sm">last sync</span>
        <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {formatSyncTime(lastSync)}
        </span>
      </Row>
      <Row onClick={handleForceSync}>
        <span class="flex-1 text-sm">{syncing ? "syncing..." : "force full sync"}</span>
        {syncDone ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#30d158" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <Chevron />
        )}
      </Row>
      {showClearConfirm ? (
        <div class="px-4 py-2">
          <ConfirmDialog
            message="clear all local data? the page will reload and re-sync."
            onConfirm={handleClearCache}
            onCancel={() => setShowClearConfirm(false)}
          />
        </div>
      ) : (
        <Row onClick={() => setShowClearConfirm(true)} danger>
          <span class="flex-1 text-sm">clear local cache</span>
          <Chevron />
        </Row>
      )}
    </Section>
  );
}

// ── About section ────────────────────────────────────────────────────────────

function AboutSection() {
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleLogout() {
    // logout() clears the session, deletes IndexedDB, and hard-reloads to /login
    await logout();
  }

  return (
    <Section title="about">
      <Row>
        <span class="flex-1 text-sm">version</span>
        <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>v1.0.0</span>
      </Row>
      {confirmLogout ? (
        <div class="px-4 py-2">
          <ConfirmDialog
            message="log out? local data will be cleared."
            onConfirm={handleLogout}
            onCancel={() => setConfirmLogout(false)}
          />
        </div>
      ) : (
        <Row onClick={() => setConfirmLogout(true)} danger>
          <span class="flex-1 text-sm">log out</span>
        </Row>
      )}
    </Section>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { route } = useLocation();
  const hasPush = typeof window !== "undefined" && "PushManager" in window;

  return (
    <div class="flex flex-col gap-4 px-4 pt-2 safe-pb-lg">
      <h1 class="text-[17px] font-semibold text-text-primary">settings</h1>

      <Section title="categories">
        <CategoriesRow onTap={() => route("/settings/categories")} />
      </Section>

      <AccountSection />
      {hasPush && <NotificationsSection />}
      <DataSection />
      <SyncSection />
      <AboutSection />
    </div>
  );
}
