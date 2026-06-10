import { useState, useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { toChildArray } from "preact";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { currentUser, logout } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { forceUpdate } from "@/sync/swUpdater";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DetailSheet } from "@/components/DetailSheet";
import { api } from "@/lib/api";
import { MONTHS_SHORT } from "@/lib/format";
import { usePressScale } from "@/lib/usePressScale";
import { Toggle } from "@/components/Toggle";

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
  const press = usePressScale<HTMLDivElement>(0.98);
  return (
    <div
      ref={tappable ? press.ref : undefined}
      onClick={onClick}
      onPointerDown={tappable ? press.onPointerDown : undefined}
      onPointerUp={tappable ? press.onPointerUp : undefined}
      onPointerCancel={tappable ? press.onPointerCancel : undefined}
      class="flex items-center gap-3"
      style={{
        padding: "12px 16px",
        minHeight: 48,
        cursor: tappable ? "pointer" : "default",
        color: danger ? "var(--color-danger)" : "var(--color-text-body)",
        WebkitTapHighlightColor: "transparent",
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
  const savePress = usePressScale<HTMLButtonElement>(0.97);
  const cancelPress = usePressScale<HTMLButtonElement>(0.97);

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
          ref={savePress.ref}
          onPointerDown={savePress.onPointerDown}
          onPointerUp={savePress.onPointerUp}
          onPointerCancel={savePress.onPointerCancel}
          onClick={handleSave}
          disabled={saving || !currentPw || !newPw}
          class="rounded-lg px-4 py-2 text-xs font-medium text-white cursor-pointer border-0"
          style={{
            backgroundColor: "var(--color-accent)",
            opacity: saving || !currentPw || !newPw ? 0.6 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {saving ? "saving..." : "save"}
        </button>
        <button
          ref={cancelPress.ref}
          onPointerDown={cancelPress.onPointerDown}
          onPointerUp={cancelPress.onPointerUp}
          onPointerCancel={cancelPress.onPointerCancel}
          onClick={onDone}
          class="rounded-lg px-4 py-2 text-xs cursor-pointer bg-transparent border-0"
          style={{ color: "var(--color-text-secondary)", WebkitTapHighlightColor: "transparent" }}
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
      .then((data: any) => {
        if (data) {
          // Normalize legacy times to exact hourly slots (XX:00)
          if (data.daily_reminder_time) {
            const h = data.daily_reminder_time.split(":")[0];
            data.daily_reminder_time = `${h.padStart(2, "0")}:00`;
          }
          if (data.weekly_summary_time) {
            const h = data.weekly_summary_time.split(":")[0];
            data.weekly_summary_time = `${h.padStart(2, "0")}:00`;
          }
          setPrefs(data as PushPrefs);
        }
      })
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
      {!!prefs.daily_reminder && (
        <div class="px-4 pb-3 flex items-center justify-between gap-3 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>reminder time</span>
          <select
            value={prefs.daily_reminder_time}
            onChange={(e) => savePrefs({ daily_reminder_time: (e.target as HTMLSelectElement).value })}
            class="rounded-lg px-2 py-1 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none [color-scheme:dark]"
            style={{ cursor: "pointer" }}
          >
            {Array.from({ length: 24 }).map((_, h) => {
              const val = `${String(h).padStart(2, "0")}:00`;
              return <option key={val} value={val}>{val}</option>;
            })}
          </select>
        </div>
      )}
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
      {!!prefs.weekly_summary && (
        <>
          <div class="px-4 pb-3 flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>summary day</span>
            <select
              value={prefs.weekly_summary_day}
              onChange={(e) => savePrefs({ weekly_summary_day: parseInt((e.target as HTMLSelectElement).value, 10) })}
              class="rounded-lg px-2 py-1 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none [color-scheme:dark]"
              style={{ cursor: "pointer" }}
            >
              {DAYS_SHORT.map((dayName, idx) => (
                <option key={idx} value={idx}>{dayName}</option>
              ))}
            </select>
          </div>
          <div class="px-4 pb-3 flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>summary time</span>
            <select
              value={prefs.weekly_summary_time}
              onChange={(e) => savePrefs({ weekly_summary_time: (e.target as HTMLSelectElement).value })}
              class="rounded-lg px-2 py-1 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none [color-scheme:dark]"
              style={{ cursor: "pointer" }}
            >
              {Array.from({ length: 24 }).map((_, h) => {
                const val = `${String(h).padStart(2, "0")}:00`;
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
          </div>
        </>
      )}
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

// ── Apple Pay automation section ─────────────────────────────────────────────

interface ApiToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewToken {
  id: string;
  name: string;
  created_at: string;
  token: string;
}

function relativeAgo(iso: string | null): string {
  if (!iso) return "never used";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "never used";
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatFullTimestamp(iso);
}

function formatFullTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function TokenDetail({
  token,
  onClose,
  onRevoked,
}: {
  token: ApiToken;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function handleRevoke() {
    setRevoking(true);
    try {
      await (api.api.tokens[":id"].$delete as any)({ param: { id: token.id } });
      onRevoked();
      onClose();
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div>
        <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {token.name}
        </h2>
      </div>
      <div
        class="rounded-xl"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <div
          class="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>created</span>
          <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {formatFullTimestamp(token.created_at)}
          </span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>last used</span>
          <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {token.last_used_at ? formatFullTimestamp(token.last_used_at) : "never"}
          </span>
        </div>
      </div>
      {confirm ? (
        <ConfirmDialog
          message="revoke this token? the iOS shortcut will stop working."
          onConfirm={handleRevoke}
          onCancel={() => setConfirm(false)}
        />
      ) : (
        <button
          onClick={() => setConfirm(true)}
          disabled={revoking}
          class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
          style={{
            height: 48,
            borderRadius: 14,
            backgroundColor: "rgba(255,55,95,0.12)",
            color: "var(--color-danger)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          revoke
        </button>
      )}
    </div>
  );
}

function GenerateTokenSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (token: NewToken) => void;
}) {
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [created, setCreated] = useState<NewToken | null>(null);
  const [copied, setCopied] = useState(false);
  const generatePress = usePressScale<HTMLButtonElement>(0.97);
  const copyPress = usePressScale<HTMLButtonElement>(0.97);
  const donePress = usePressScale<HTMLButtonElement>(0.97);

  async function handleGenerate() {
    const trimmed = name.trim();
    if (!trimmed || generating) return;
    setGenerating(true);
    try {
      const res = await api.api.tokens.$post({ json: { name: trimmed } });
      if (!res.ok) return;
      const data = (await res.json()) as NewToken;
      setCreated(data);
      onCreated(data);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API might not be available — surface a hint by toggling state.
    }
  }

  if (!created) {
    return (
      <div class="flex flex-col gap-4">
        <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          new token
        </h2>
        <input
          type="text"
          placeholder="my iphone"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          class="rounded-lg bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none border border-text-ghost/20"
          autoFocus
        />
        <button
          ref={generatePress.ref}
          onPointerDown={generatePress.onPointerDown}
          onPointerUp={generatePress.onPointerUp}
          onPointerCancel={generatePress.onPointerCancel}
          onClick={handleGenerate}
          disabled={!name.trim() || generating}
          class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
          style={{
            height: 48,
            borderRadius: 14,
            backgroundColor: "var(--color-accent)",
            opacity: !name.trim() || generating ? 0.5 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {generating ? "generating..." : "generate"}
        </button>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
        token created
      </h2>
      <p class="text-xs" style={{ color: "var(--color-warning, #ff9f0a)" }}>
        save this token now — it won't be shown again
      </p>
      <div
        class="rounded-xl px-3 py-3 break-all"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          fontSize: 12,
          color: "var(--color-text-primary)",
          userSelect: "all",
        }}
      >
        {created.token}
      </div>
      <button
        ref={copyPress.ref}
        onPointerDown={copyPress.onPointerDown}
        onPointerUp={copyPress.onPointerUp}
        onPointerCancel={copyPress.onPointerCancel}
        onClick={handleCopy}
        class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
        style={{
          height: 44,
          borderRadius: 14,
          backgroundColor: "rgba(108,156,255,0.12)",
          color: "var(--color-accent)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {copied ? "copied" : "copy to clipboard"}
      </button>
      <button
        ref={donePress.ref}
        onPointerDown={donePress.onPointerDown}
        onPointerUp={donePress.onPointerUp}
        onPointerCancel={donePress.onPointerCancel}
        onClick={onClose}
        class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
        style={{
          height: 44,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.06)",
          color: "var(--color-text-secondary)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        done
      </button>
    </div>
  );
}

function CopyableValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard */
    }
  }
  return (
    <button
      onClick={handleCopy}
      class="text-left bg-transparent border-0 cursor-pointer w-full"
      style={{ WebkitTapHighlightColor: "transparent", padding: 0 }}
      aria-label={label}
    >
      <code
        class="block break-all"
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          fontSize: 11.5,
          color: copied ? "var(--color-accent)" : "var(--color-text-primary)",
          backgroundColor: "rgba(255,255,255,0.04)",
          borderRadius: 6,
          padding: "4px 6px",
        }}
      >
        {copied ? "copied" : value}
      </code>
    </button>
  );
}

function SetupInstructions() {
  return (
    <div class="flex flex-col gap-4 text-sm" style={{ color: "var(--color-text-body)" }}>
      <div>
        <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          set up apple pay automation
        </h2>
        <p class="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
          your iphone can log expenses automatically when you tap to pay with apple pay. here's
          how to set it up:
        </p>
      </div>

      <ol class="flex flex-col gap-3 pl-5" style={{ listStyle: "decimal" }}>
        <li>
          <div class="font-medium" style={{ color: "var(--color-text-primary)" }}>generate a token</div>
          <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            if you haven't yet, tap "generate new token" and copy it. you'll paste it in step 3.
          </p>
        </li>
        <li>
          <div class="font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
            install the prebuilt shortcut on your iphone
          </div>
          {import.meta.env.VITE_APPLE_SHORTCUT_URL ? (
            <>
              <p class="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>
                open this link on the iphone you pay with — tap "add shortcut" when the shortcuts app prompts.
              </p>
              <a
                href={import.meta.env.VITE_APPLE_SHORTCUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-accent)",
                  border: "1px solid var(--color-border)",
                }}
              >
                get the xpensify shortcut →
              </a>
            </>
          ) : (
            <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              build your own iOS shortcut that POSTs to <code>/api/shortcuts/expense</code>
              {" "}with a Bearer token. publish it to iCloud and set
              {" "}<code>VITE_APPLE_SHORTCUT_URL</code> in your build env to surface a
              {" "}one-tap install link here.
            </p>
          )}
        </li>
        <li>
          <div class="font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
            paste your token into the shortcut
          </div>
          <p class="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>
            in the shortcuts app, open the imported "xpensify apple pay" shortcut, find the
            "get contents of url" action, expand "headers", and replace the placeholder in the
            Authorization header with your token:
          </p>
          <CopyableValue value="Bearer YOUR_TOKEN_HERE" label="copy header value" />
          <p class="text-xs mt-1" style={{ color: "var(--color-text-tertiary)" }}>
            replace YOUR_TOKEN_HERE with the token from step 1. tap done to save.
          </p>
        </li>
        <li>
          <div class="font-medium" style={{ color: "var(--color-text-primary)" }}>
            wire it up to apple pay
          </div>
          <p class="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
            in the shortcuts app, go to the automation tab → new automation → "wallet"
            (or "transaction" on older ios). under "when i tap", select all the cards you want
            to track. tap next → "run shortcut" → pick "xpensify apple pay".
          </p>
        </li>
        <li>
          <div class="font-medium" style={{ color: "var(--color-text-primary)" }}>save the automation</div>
          <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            turn off "ask before running" so it runs silently.
          </p>
        </li>
        <li>
          <div class="font-medium" style={{ color: "var(--color-text-primary)" }}>
            test by paying with apple pay at any store
          </div>
          <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            open xpensify afterward — you should see "1 expense to confirm" at the top of the add screen.
          </p>
        </li>
      </ol>

      <div class="flex flex-col gap-1 pt-2">
        <p class="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>about notifications</p>
        <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          xpensify sends its own push notification for every apple pay tap
          (auto-saved, tap to confirm, etc). the prebuilt shortcut has no
          "show notification" action — don't add one, or you'll get duplicates.
          enable push under settings → notifications if you haven't.
        </p>
      </div>

      <div class="flex flex-col gap-1 pt-2">
        <p class="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>sharing with the other person in this account</p>
        <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          send them this same setup screen — they install the shortcut from
          the link above, generate their own token under settings → apple pay
          automation, and paste it into their copy of the shortcut. their
          pending expenses land under their own user.
        </p>
      </div>

      <div class="flex flex-col gap-1 pt-2">
        <p class="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>notes</p>
        <ul class="text-xs flex flex-col gap-0.5 pl-4" style={{ color: "var(--color-text-secondary)", listStyle: "disc" }}>
          <li>only works for in-store apple pay taps, not online purchases</li>
          <li>only EUR transactions are supported</li>
          <li>if you return something, edit the expense manually after</li>
        </ul>
      </div>
    </div>
  );
}

function ApplePaySection() {
  const { route } = useLocation();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [selectedToken, setSelectedToken] = useState<ApiToken | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [merchantCount, setMerchantCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function loadTokens() {
    try {
      const res = await api.api.tokens.$get();
      if (!res.ok) return;
      const data = (await res.json()) as ApiToken[];
      setTokens(data);
    } catch {
      /* offline */
    }
  }

  async function loadMerchantCount() {
    try {
      const res = await api.api.merchants.$get();
      if (!res.ok) return;
      const data = (await res.json()) as unknown[];
      setMerchantCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* offline */
    }
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.api.merchants.import.$post();
      if (res.ok) {
        const data = (await res.json()) as { inserted: number; skipped: number; total: number };
        setImportResult(
          data.inserted === 0
            ? `nothing new to import (${data.skipped} already known)`
            : `imported ${data.inserted} merchant${data.inserted === 1 ? "" : "s"}`,
        );
        loadMerchantCount();
        setTimeout(() => setImportResult(null), 3000);
      }
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    loadTokens();
    loadMerchantCount();
  }, []);

  return (
    <>
      <Section title="apple pay automation">
        {(tokens ?? []).map((t) => (
          <Row key={t.id} onClick={() => setSelectedToken(t)}>
            <span class="flex-1 text-sm">{t.name}</span>
            <span class="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              {t.last_used_at ? `used ${relativeAgo(t.last_used_at)}` : "never used"}
            </span>
            <Chevron />
          </Row>
        ))}
        <Row onClick={() => setGenerating(true)}>
          <span class="flex-1 text-sm">generate new token</span>
          <Chevron />
        </Row>
        <Row onClick={() => route("/settings/merchants")}>
          <span class="flex-1 text-sm">merchant memory</span>
          <span class="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            {merchantCount === null ? "" : `${merchantCount} known`}
          </span>
          <Chevron />
        </Row>
        <Row onClick={handleImport}>
          <div class="flex-1 flex flex-col gap-0.5">
            <span class="text-sm">{importing ? "importing..." : "import existing apple pay expenses"}</span>
            <span class="text-xs" style={{ color: "var(--color-text-hint)" }}>
              {importResult ?? "seed memory from already-confirmed apple pay history"}
            </span>
          </div>
        </Row>
        <Row onClick={() => setShowInstructions(true)}>
          <span class="flex-1 text-sm">how to set up</span>
          <Chevron />
        </Row>
      </Section>

      <DetailSheet open={selectedToken !== null} onClose={() => setSelectedToken(null)}>
        {selectedToken && (
          <TokenDetail
            token={selectedToken}
            onClose={() => setSelectedToken(null)}
            onRevoked={loadTokens}
          />
        )}
      </DetailSheet>

      <DetailSheet open={generating} onClose={() => setGenerating(false)}>
        {generating && (
          <GenerateTokenSheet
            onClose={() => setGenerating(false)}
            onCreated={() => loadTokens()}
          />
        )}
      </DetailSheet>

      <DetailSheet open={showInstructions} onClose={() => setShowInstructions(false)}>
        {showInstructions && <SetupInstructions />}
      </DetailSheet>
    </>
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
      <Row onClick={() => { forceUpdate().catch(() => {}); }}>
        <span class="flex-1 text-sm">force update</span>
        <Chevron />
      </Row>
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
        <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>v3.21</span>
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
      <ApplePaySection />
      <SyncSection />
      <AboutSection />
    </div>
  );
}
