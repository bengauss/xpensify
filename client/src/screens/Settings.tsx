import { useState, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import type { Category } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { currentUser, logout } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { categoryIcons } from "@/icons";
import { api } from "@/lib/api";

// ── Section Card ──────────────────────────────────────────────────────────────

function Card({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="bg-surface rounded-xl p-4 flex flex-col gap-3">
      {children}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: preact.ComponentChildren }) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-xs uppercase tracking-wider text-text-ghost">{title}</span>
      {action}
    </div>
  );
}

// ── Categories Section ────────────────────────────────────────────────────────

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: (newName: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(category.name);

  const IconComponent = categoryIcons[category.icon] ?? categoryIcons["other"];

  function commitEdit() {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== category.name) {
      onEdit(trimmed);
    }
    setEditing(false);
  }

  return (
    <div class="flex items-center gap-2 py-1">
      {/* Icon */}
      <span class="shrink-0" style={{ color: category.color }}>
        <IconComponent color={category.color} size={20} />
      </span>

      {/* Name / edit input */}
      {editing ? (
        <input
          class="flex-1 rounded bg-bg-primary px-2 py-0.5 text-sm text-text-primary outline-none border border-accent/40"
          value={editVal}
          onInput={(e) => setEditVal((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") { setEditVal(category.name); setEditing(false); }
          }}
          onBlur={commitEdit}
          autoFocus
        />
      ) : (
        <span class="flex-1 text-sm text-text-primary">{category.name}</span>
      )}

      {/* Arrow buttons */}
      <button
        onClick={onMoveUp}
        disabled={isFirst}
        class="text-text-ghost hover:text-text-primary disabled:opacity-20 px-1 text-base leading-none"
        title="Move up"
      >
        ↑
      </button>
      <button
        onClick={onMoveDown}
        disabled={isLast}
        class="text-text-ghost hover:text-text-primary disabled:opacity-20 px-1 text-base leading-none"
        title="Move down"
      >
        ↓
      </button>

      {/* Edit (pencil) */}
      <button
        onClick={() => { setEditVal(category.name); setEditing(true); }}
        class="text-text-ghost hover:text-accent px-1"
        title="Edit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {/* Delete (x) */}
      <button
        onClick={onDelete}
        class="text-text-ghost hover:text-red-400 px-1"
        title="Delete"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function CategoriesSection() {
  const categories = useLiveQuery(() =>
    db.categories.orderBy("sort_order").toArray(), []
  ) ?? [];

  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function patchCategory(id: string, body: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await api.api.categories[":id"].$patch({ param: { id }, json: body } as any);
    if (!res.ok) throw new Error("Failed to update category");
    // Refresh local DB
    const updated = await res.json() as unknown as Category;
    await db.categories.put(updated);
  }

  async function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const a = categories[idx];
    const b = categories[idx - 1];
    const aOrder = a.sort_order;
    const bOrder = b.sort_order;
    await patchCategory(a.id, { sort_order: bOrder });
    await patchCategory(b.id, { sort_order: aOrder });
  }

  async function handleMoveDown(idx: number) {
    if (idx === categories.length - 1) return;
    const a = categories[idx];
    const b = categories[idx + 1];
    const aOrder = a.sort_order;
    const bOrder = b.sort_order;
    await patchCategory(a.id, { sort_order: bOrder });
    await patchCategory(b.id, { sort_order: aOrder });
  }

  async function handleEdit(id: string, newName: string) {
    await patchCategory(id, { name: newName });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    const res = await api.api.categories[":id"].$delete({ param: { id } });
    if (!res.ok) { setError("Failed to delete category"); return; }
    await db.categories.delete(id);
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await api.api.categories.$post({ json: { name } } as any);
    if (!res.ok) { setError("Failed to add category"); return; }
    const created = await res.json() as unknown as Category;
    await db.categories.put(created);
    setAddName("");
    setAdding(false);
  }

  return (
    <Card>
      <SectionHeader
        title="categories"
        action={
          <button
            onClick={() => setAdding(true)}
            class="text-xs text-accent hover:opacity-80"
          >
            add
          </button>
        }
      />

      {error && <p class="text-xs text-red-400">{error}</p>}

      <div class="flex flex-col divide-y divide-text-ghost/10">
        {categories.map((cat, idx) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            isFirst={idx === 0}
            isLast={idx === categories.length - 1}
            onMoveUp={() => handleMoveUp(idx)}
            onMoveDown={() => handleMoveDown(idx)}
            onEdit={(newName) => handleEdit(cat.id, newName)}
            onDelete={() => handleDelete(cat.id, cat.name)}
          />
        ))}
      </div>

      {adding && (
        <div class="flex items-center gap-2 pt-2 border-t border-text-ghost/10">
          <input
            class="flex-1 rounded bg-bg-primary px-2 py-1.5 text-sm text-text-primary outline-none border border-accent/40"
            placeholder="Category name"
            value={addName}
            onInput={(e) => setAddName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            autoFocus
          />
          <button
            onClick={handleAdd}
            class="text-xs text-accent hover:opacity-80 px-2 py-1.5"
          >
            save
          </button>
          <button
            onClick={() => { setAdding(false); setAddName(""); }}
            class="text-xs text-text-ghost hover:text-text-primary px-2 py-1.5"
          >
            cancel
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Users Section ─────────────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

function PasswordChangeForm() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    setMsg(""); setError("");
    const res = await api.api.auth["change-password"].$post({ json: { current_password: currentPw, new_password: newPw } });
    if (res.ok) {
      setMsg("Password updated");
      setCurrentPw(""); setNewPw("");
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError((data as { error?: string }).error ?? "Failed to change password");
    }
  }

  return (
    <div class="mt-2 flex flex-col gap-2 pl-10">
      <input
        type="password"
        placeholder="Current password"
        value={currentPw}
        onInput={(e) => setCurrentPw((e.target as HTMLInputElement).value)}
        class="rounded bg-bg-primary px-3 py-1.5 text-sm text-text-primary outline-none border border-text-ghost/20"
      />
      <input
        type="password"
        placeholder="New password"
        value={newPw}
        onInput={(e) => setNewPw((e.target as HTMLInputElement).value)}
        class="rounded bg-bg-primary px-3 py-1.5 text-sm text-text-primary outline-none border border-text-ghost/20"
      />
      {error && <p class="text-xs text-red-400">{error}</p>}
      {msg && <p class="text-xs text-green-400">{msg}</p>}
      <button
        onClick={handleSave}
        class="self-start rounded bg-accent/20 px-3 py-1 text-xs text-accent hover:bg-accent/30"
      >
        save
      </button>
    </div>
  );
}

function UsersSection() {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const displayUsers = currentUser.value ? [currentUser.value] : [];

  return (
    <Card>
      <SectionHeader title="users" />
      <div class="flex flex-col gap-3">
        {displayUsers.map((user) => (
          <div key={user.id}>
            <div class="flex items-center gap-3">
              {/* Avatar */}
              <div
                class="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-medium text-bg-primary"
                style={{ backgroundColor: user.avatar_color }}
              >
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <span class="flex-1 text-sm text-text-primary">{user.display_name}</span>
              {user.id === currentUser.value?.id && (
                <button
                  onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  class="text-xs text-text-ghost hover:text-accent"
                >
                  {expandedUser === user.id ? "cancel" : "change password"}
                </button>
              )}
            </div>
            {expandedUser === user.id && user.id === currentUser.value?.id && <PasswordChangeForm />}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Push Notifications Section ────────────────────────────────────────────────

interface PushPrefs {
  daily_reminder: number;
  daily_reminder_time: string;
  weekly_summary: number;
  weekly_summary_day: number;
  weekly_summary_time: string;
}

function PushNotificationsSection() {
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<PushPrefs>({
    daily_reminder: 0,
    daily_reminder_time: "21:00",
    weekly_summary: 0,
    weekly_summary_day: 0,
    weekly_summary_time: "09:00",
  });
  const [msg, setMsg] = useState("");

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    api.api.push.preferences.$get()
      .then((r) => r.ok ? r.json() : null)
      .then((data: unknown) => { if (data) setPrefs(data as PushPrefs); })
      .catch(() => {});
  }, []);

  async function enablePush() {
    setMsg("");
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) { setMsg("VAPID key not configured"); return; }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setMsg("Permission denied"); return; }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const res = await api.api.push.subscribe.$post({ json: sub.toJSON() });
    if (res.ok) { setSubscribed(true); setMsg("Push notifications enabled"); }
    else setMsg("Failed to subscribe");
  }

  async function savePrefs(updated: Partial<PushPrefs>) {
    const next = { ...prefs, ...updated };
    setPrefs(next);
    await api.api.push.preferences.$put({ json: next }).catch(() => {});
  }

  return (
    <Card>
      <SectionHeader title="push notifications" />

      {msg && <p class="text-xs text-accent">{msg}</p>}

      {!subscribed && (
        <button
          onClick={enablePush}
          class="self-start rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
        >
          enable push notifications
        </button>
      )}

      {/* Daily reminder */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!prefs.daily_reminder}
              onChange={(e) => savePrefs({ daily_reminder: (e.target as HTMLInputElement).checked ? 1 : 0 })}
              class="accent-accent"
            />
            <span class="text-sm text-text-primary">Daily reminder</span>
          </label>
        </div>
        {!!prefs.daily_reminder && (
          <div class="pl-6 flex items-center gap-2">
            <span class="text-xs text-text-ghost">Time:</span>
            <input
              type="time"
              value={prefs.daily_reminder_time}
              onInput={(e) => savePrefs({ daily_reminder_time: (e.target as HTMLInputElement).value })}
              class="rounded bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none border border-text-ghost/20 [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {/* Weekly summary */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!prefs.weekly_summary}
              onChange={(e) => savePrefs({ weekly_summary: (e.target as HTMLInputElement).checked ? 1 : 0 })}
              class="accent-accent"
            />
            <span class="text-sm text-text-primary">Weekly summary</span>
          </label>
        </div>
        {!!prefs.weekly_summary && (
          <div class="pl-6 flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-ghost">Day:</span>
              <select
                value={prefs.weekly_summary_day}
                onChange={(e) => savePrefs({ weekly_summary_day: parseInt((e.target as HTMLSelectElement).value) })}
                class="rounded bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none border border-text-ghost/20"
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-ghost">Time:</span>
              <input
                type="time"
                value={prefs.weekly_summary_time}
                onInput={(e) => savePrefs({ weekly_summary_time: (e.target as HTMLInputElement).value })}
                class="rounded bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none border border-text-ghost/20 [color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Data Section ──────────────────────────────────────────────────────────────

function DataSection() {
  function handleExport() {
    window.location.href = "/api/export";
  }

  return (
    <Card>
      <SectionHeader title="data" />
      <div class="flex flex-col gap-3">
        <button
          onClick={handleExport}
          class="self-start rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
        >
          export CSV
        </button>
        <p class="text-xs text-text-ghost">
          import CSV: use the server-side import script (<code class="font-mono text-text-secondary">npm run import</code>)
        </p>
      </div>
    </Card>
  );
}

// ── Sync Section ──────────────────────────────────────────────────────────────

function SyncSection() {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setLastSync(localStorage.getItem("xpensify_last_sync"));
  }, []);

  async function handleForceSync() {
    setSyncing(true); setMsg("");
    localStorage.removeItem("xpensify_last_sync");
    setLastSync(null);
    try {
      await sync();
      setLastSync(localStorage.getItem("xpensify_last_sync"));
      setMsg("Full sync complete");
    } catch {
      setMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearCache() {
    if (!confirm("Clear all local data? The page will reload and re-sync from the server.")) return;
    await db.expenses.clear();
    await db.categories.clear();
    await db.subcategories.clear();
    await db.recurring_templates.clear();
    localStorage.removeItem("xpensify_last_sync");
    window.location.reload();
  }

  function formatSyncTime(ts: string | null) {
    if (!ts) return "never";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  return (
    <Card>
      <SectionHeader title="sync" />
      <p class="text-xs text-text-ghost">
        Last sync: <span class="text-text-secondary">{formatSyncTime(lastSync)}</span>
      </p>
      {msg && <p class="text-xs text-accent">{msg}</p>}
      <div class="flex flex-wrap gap-2">
        <button
          onClick={handleForceSync}
          disabled={syncing}
          class="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
        >
          {syncing ? "syncing…" : "force full sync"}
        </button>
        <button
          onClick={handleClearCache}
          class="rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
        >
          clear local cache
        </button>
      </div>
    </Card>
  );
}

// ── About Section ─────────────────────────────────────────────────────────────

function AboutSection() {
  const { route } = useLocation();

  async function handleLogout() {
    await logout();
    route("/login");
  }

  return (
    <Card>
      <SectionHeader title="about" />
      <p class="text-sm text-text-secondary">xpensify v1.0.0</p>
      <button
        onClick={handleLogout}
        class="self-start rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
      >
        log out
      </button>
    </Card>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const hasPush = typeof window !== "undefined" && "PushManager" in window;

  return (
    <div class="flex flex-col gap-4 px-4 pb-24 pt-2">
      <h1 class="text-sm uppercase tracking-wider text-text-ghost px-1">settings</h1>

      <CategoriesSection />
      <UsersSection />
      {hasPush && <PushNotificationsSection />}
      <DataSection />
      <SyncSection />
      <AboutSection />
    </div>
  );
}
