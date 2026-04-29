import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { animate } from "motion";
import { durations, getReducedMotionOverride } from "@/lib/animations";
import { db } from "@/db/local";
import type { Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput, parseCents, formatCents, type AmountInputCelebrateApi } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { NoteInput } from "@/components/NoteInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { currentUser } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { useLocation } from "preact-iso";
import { formatMoney, formatMoneyWhole, monthKey, MONTHS_SHORT } from "@/lib/format";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";
import { editingExpense } from "@/lib/editing";
import { useEntrance } from "@/lib/entrance";
import { usePressScale } from "@/lib/usePressScale";
import { api } from "@/lib/api";
import {
  pendingExpenses,
  refreshPendingExpenses,
  confirmingPending,
} from "@/lib/pending";

// ── Discretionary spend helpers ──────────────────────────────────────────────

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function roundToHundred(cents: number): number {
  return Math.round(cents / 10000) * 10000;
}

function computeDiscretionary(expenses: Expense[] | undefined) {
  if (!expenses) return null;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curKey = monthKey(curYear, curMonth);

  // Current month discretionary
  const currentTotal = expenses
    .filter((e) => e.timestamp.startsWith(curKey) && e.deleted === 0 && e.source !== "recurring")
    .reduce((s, e) => s + e.amount, 0);

  // Last 3 completed months
  let y = curYear, m = curMonth;
  const monthTotals: number[] = [];
  for (let i = 0; i < 3; i++) {
    ({ year: y, month: m } = prevMonth(y, m));
    const key = monthKey(y, m);
    const total = expenses
      .filter((e) => e.timestamp.startsWith(key) && e.deleted === 0 && e.source !== "recurring")
      .reduce((s, e) => s + e.amount, 0);
    monthTotals.push(total);
  }

  // Outlier guard: if any month > 2x median, drop it
  const hasData = monthTotals.some((t) => t > 0);
  if (!hasData) return { current: currentTotal, avg: null };

  const sorted = [...monthTotals].sort((a, b) => a - b);
  const median = sorted[1]; // middle of 3
  const filtered = monthTotals.filter((t) => t <= median * 2);
  const avg = filtered.length > 0
    ? filtered.reduce((s, t) => s + t, 0) / filtered.length
    : monthTotals.reduce((s, t) => s + t, 0) / monthTotals.length;

  return { current: currentTotal, avg: roundToHundred(avg) };
}

export function AddScreen() {
  const editing = editingExpense.value;
  const isEditing = !!editing;
  const confirming = confirmingPending.value;
  const isConfirming = !!confirming;
  const { path, route } = useLocation();

  // In confirm mode, seed amount + note from the pending expense; otherwise
  // fall back to edit-mode seeds, and finally to a blank Add screen.
  const [amount, setAmount] = useState(
    confirming
      ? formatCents(confirming.amount)
      : editing
        ? formatCents(editing.amount)
        : ""
  );
  const [note, setNote] = useState(
    confirming?.note ?? editing?.note ?? ""
  );
  const [dateStr, setDateStr] = useState(
    confirming
      ? confirming.timestamp.split("T")[0]
      : editing
        ? editing.timestamp.split("T")[0]
        : new Date().toISOString().split("T")[0]
  );
  // Pending category/subcategory selection — only used in edit/confirm modes, so the user
  // can change multiple fields before committing via the save button.
  const [pendingCategoryId, setPendingCategoryId] = useState<string>(editing?.category_id ?? "");
  const [pendingSubcategoryId, setPendingSubcategoryId] = useState<string>(editing?.subcategory_id ?? "");

  // confirm-mode local state
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  // Remount key for CategorySelector — bumped after each save so the selector
  // resets to the grid view and replays its staggered entrance animation.
  const [formKey, setFormKey] = useState(0);

  const amountRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  // Imperative handle exposed by AmountInput for the save-celebration
  // (flash + checkmark + roll to 0). Fire-and-forget; returns a promise that
  // resolves when the roll lands so we can defer clearing the amount state.
  const amountCelebrateRef = useRef<AmountInputCelebrateApi | null>(null);

  // Entrance wrappers — refs populated via data-add-reveal + data-revealed.
  const amountWrapRef = useRef<HTMLDivElement>(null);
  const dateLineRef = useRef<HTMLDivElement>(null);
  const noteWrapRef = useRef<HTMLDivElement>(null);

  // Edit-bar press feedback (previously inline on each button).
  const saveEditPress = usePressScale<HTMLButtonElement>(0.97);
  const cancelEditPress = usePressScale<HTMLButtonElement>(0.97);
  const confirmPress = usePressScale<HTMLButtonElement>(0.97);
  const skipPress = usePressScale<HTMLButtonElement>(0.97);
  const bannerPress = usePressScale<HTMLDivElement>(0.98);
  // Intentionally no press-scale on the date button: animating transform on
  // the click target during pointerup breaks the iOS user-activation chain
  // that `HTMLInputElement.showPicker()` relies on, so the native calendar
  // never opens. Keep it plain click-only.

  // Re-focus input when navigating back to Add tab. Don't auto-focus in
  // confirm mode — the user is reviewing a pre-filled amount, not entering
  // a fresh number, and a popped keyboard would just cover the category grid.
  useEffect(() => {
    if (path === "/" && !isConfirming) {
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [path, isConfirming]);

  // Refresh the pending list on mount so the banner reflects server state
  // even when the user opens the app cold (no visibility change yet).
  useEffect(() => {
    refreshPendingExpenses().catch(() => {});
  }, []);

  // Chained column entrance: amount → date line → note. The CategorySelector
  // runs its own cascade, which kicks in roughly where the static rows settle.
  useEntrance(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ANIM = animate as any;
    const opts = { ...durations.soft, ...getReducedMotionOverride() };

    const reveal = (el: HTMLElement | null, delayS: number) => {
      if (!el) return;
      ANIM(el, { opacity: [0, 1], y: [-8, 0] }, { ...opts, delay: delayS });
      el.setAttribute("data-revealed", "1");
    };

    reveal(amountWrapRef.current, 0);
    reveal(dateLineRef.current, 0.03);
    // Note tails the last visible category card; CategorySelector cascade runs
    // ~80ms + ~300ms cards ≈ 0.38s, so start note near the end of that window.
    reveal(noteWrapRef.current, 0.35);
  });

  const categories = CATEGORIES;
  const subcategories = SUBCATEGORIES;

  // Discretionary spend counter — only queries the last 4 months via the
  // timestamp index. Full-table scans aren't needed for this widget.
  const allExpenses = useLiveQuery(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    return db.expenses.where("timestamp").aboveOrEqual(start).toArray();
  });
  const disc = useMemo(() => computeDiscretionary(allExpenses), [allExpenses]);

  const today = new Date();
  const dateLabel = formatDateLabel(dateStr, today);

  async function handleSelect(categoryId: string, subcategoryId: string) {
    // In edit / confirm modes, tapping a subcategory only selects it — commit
    // happens via the explicit save / confirm button.
    if (isEditing || isConfirming) {
      setPendingCategoryId(categoryId);
      setPendingSubcategoryId(subcategoryId);
      return;
    }

    const amountCents = parseCents(amount);
    if (amountCents <= 0) {
      // Category-first flow: remember the selection so the card/pill stays
      // highlighted while the user enters the amount, then shake the amount
      // input to draw attention to the missing field.
      setPendingCategoryId(categoryId);
      setPendingSubcategoryId(subcategoryId);
      if (amountRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (animate as any)(
          amountRef.current,
          { x: [0, -8, 8, -6, 6, -3, 0] },
          { duration: 0.4, ...getReducedMotionOverride() }
        );
      }
      setTimeout(() => amountRef.current?.focus(), 0);
      return;
    }

    const userId = currentUser.value?.id;
    if (!userId) {
      // Auth not yet loaded — refuse to save rather than persist a row with
      // empty user_id. Silent — extremely rare edge case; the form just
      // doesn't submit.
      return;
    }

    const now = new Date().toISOString();

    // Use real time for today, noon for backdated entries
    const todayStr = new Date().toISOString().split("T")[0];
    const timestamp = dateStr === todayStr ? now : `${dateStr}T12:00:00.000Z`;

    await db.expenses.add({
      id: crypto.randomUUID(),
      user_id: userId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: amountCents,
      note: note.trim() || null,
      tags: null,
      image_url: null,
      timestamp,
      source: "manual",
      recurring_template_id: null,
      deleted: 0,
      status: "confirmed",
      sync_status: "pending",
      created_at: now,
      updated_at: now,
    });

    if (amountRef.current) {
      // Motion springs with multi-keyframe arrays can re-run physics per
      // segment and skip unpredictably; use a clean duration bounce.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (animate as any)(
        amountRef.current,
        { scale: [1, 0.97, 1] },
        { duration: 0.3, ease: [0.22, 1, 0.36, 1], ...getReducedMotionOverride() },
      );
    }

    sync().catch(console.error);

    // Clear the form state NOW so a rapid double-tap on another pill can't
    // re-enter handleSelect with the same amount (parseCents("") returns 0
    // and the guard above bails out). The celebrate roll overlays the empty
    // input via its own rollingText state — the user still sees the number
    // ticking down past the (invisibly) cleared value.
    const fromCents = amountCents;
    setAmount("");
    setNote("");
    setDateStr(new Date().toISOString().split("T")[0]);
    setPendingCategoryId("");
    setPendingSubcategoryId("");

    const celebration = amountCelebrateRef.current?.celebrate(fromCents)
      ?? Promise.resolve();

    celebration.then(() => {
      // Bump CategorySelector key after the roll so the grid reset + cascade
      // plays once the celebration has finished.
      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 50);
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const amountCents = parseCents(amount);
    if (amountCents <= 0) return;
    if (!pendingCategoryId || !pendingSubcategoryId) return;

    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split("T")[0];
    const timestamp = dateStr === todayStr ? now : `${dateStr}T12:00:00.000Z`;

    await db.expenses.update(editing.id, {
      amount: amountCents,
      category_id: pendingCategoryId,
      subcategory_id: pendingSubcategoryId,
      note: note.trim() || null,
      timestamp,
      updated_at: now,
      sync_status: "pending",
    });

    // No toast or banner on edit — the user sees the updated row in History
    // immediately, which is its own confirmation.
    editingExpense.value = null;
    sync().catch(console.error);
    route("/history");
  }

  function handleCancelEdit() {
    editingExpense.value = null;
    route("/history");
  }

  async function handleConfirmPending() {
    if (!confirming) return;
    if (!pendingCategoryId || !pendingSubcategoryId) return;
    const amountCents = parseCents(amount);
    if (amountCents <= 0) return;

    setConfirmSaving(true);
    try {
      const trimmedNote = note.trim();
      const res = await (api.api.pending[":id"].confirm.$patch as any)({
        param: { id: confirming.id },
        json: {
          category_id: pendingCategoryId,
          subcategory_id: pendingSubcategoryId,
          amount: amountCents,
          note: trimmedNote === "" ? null : trimmedNote,
        },
      });
      if (!res.ok) throw new Error("confirm failed");

      confirmingPending.value = null;
      await refreshPendingExpenses();
      sync().catch(console.error);

      // If more pending remain, return to the confirm list; otherwise go to history.
      if (pendingExpenses.value.length > 0) {
        route("/confirm");
      } else {
        route("/history");
      }
    } catch (err) {
      console.error("[confirm] failed", err);
    } finally {
      setConfirmSaving(false);
    }
  }

  async function handleSkipPending() {
    if (!confirming) return;
    try {
      await (api.api.pending[":id"].$delete as any)({ param: { id: confirming.id } });
    } catch (err) {
      console.error("[skip] failed", err);
    }
    confirmingPending.value = null;
    await refreshPendingExpenses();
    if (pendingExpenses.value.length > 0) {
      route("/confirm");
    } else {
      route("/");
    }
  }

  // Clear confirm mode on unmount so a stale pending object can't leak into
  // the next Add screen mount when the user just taps another tab.
  useEffect(() => {
    return () => {
      if (confirmingPending.value) confirmingPending.value = null;
    };
  }, []);

  const pendingList = pendingExpenses.value;
  const showBanner = !isEditing && !isConfirming && pendingList.length > 0;
  const latestPending = pendingList.length > 0
    ? [...pendingList].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    : null;

  return (
    <div class={`flex flex-col gap-4 px-4 pt-2 ${isEditing || isConfirming ? "pb-40" : "safe-pb"}`}>
      <div ref={amountWrapRef} data-add-reveal>
        <AmountInput
          value={amount}
          onChange={setAmount}
          inputRef={amountRef}
          celebrateRef={amountCelebrateRef}
        />
      </div>

      {/* Pending-expenses banner — only shown in normal Add mode (not edit / confirm) */}
      {showBanner && latestPending && (
        <div
          ref={bannerPress.ref}
          onPointerDown={bannerPress.onPointerDown}
          onPointerUp={bannerPress.onPointerUp}
          onPointerCancel={bannerPress.onPointerCancel}
          onClick={() => route("/confirm")}
          class="flex items-center gap-3 cursor-pointer"
          style={{
            backgroundColor: "rgba(108,156,255,0.08)",
            border: "0.5px solid rgba(108,156,255,0.2)",
            borderRadius: 14,
            padding: "12px 16px",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm" style={{ fontWeight: 500, color: "var(--color-text-body)" }}>
              {pendingList.length === 1
                ? "1 expense to confirm"
                : `${pendingList.length} expenses to confirm`}
            </div>
            <div class="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
              {pendingList.length > 1 ? "latest: " : ""}
              {formatMoney(latestPending.amount)} at {latestPending.note ?? "—"},{" "}
              {pendingTimeLabel(latestPending.timestamp)}
            </div>
          </div>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      )}

      {/* Date label + discretionary counter (or "from apple pay" in confirm mode) */}
      <div
        ref={dateLineRef}
        data-add-reveal
        class="flex items-center justify-between px-1"
      >
        {/* Date — tappable to open native picker. Uses <label> wrapping the
            input so the tap lands on the input itself: iOS Safari opens the
            date picker natively on input click, avoiding the fragile JS
            `showPicker()` + user-activation chain that has regressed twice. */}
        <label
          class="relative inline-block text-xs cursor-pointer"
          style={{ color: (isEditing || isConfirming) ? "var(--color-text-secondary)" : "var(--color-text-tertiary)" }}
        >
          {isEditing
            ? `editing · ${dateLabel}`
            : isConfirming
              ? confirmDateTimeLabel(confirming!.timestamp)
              : dateLabel}
          <input
            ref={dateInputRef}
            type="date"
            value={dateStr}
            onInput={(e) => setDateStr((e.target as HTMLInputElement).value)}
            class="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="change date"
            style={{ colorScheme: "dark" }}
          />
        </label>

        {/* Right side: discretionary counter in normal mode, "from apple pay" in confirm mode. */}
        {isConfirming ? (
          <span
            class="text-xs flex items-center gap-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.72 6.4c-1.45 0-2.46.65-3.36.65-.9 0-1.86-.62-3.16-.62-1.7 0-3.34.97-4.27 2.55-1.83 3.18-.47 7.86 1.31 10.43.86 1.26 1.9 2.66 3.27 2.66 1.32 0 1.79-.83 3.34-.83 1.55 0 1.97.83 3.32.83 1.39 0 2.27-1.27 3.13-2.55a11.27 11.27 0 0 0 1.42-2.93c-.04-.02-2.73-1.06-2.73-4.16 0-2.69 2.16-3.97 2.26-4.04-1.24-1.83-3.13-2.04-3.78-2.04-1.7 0-3.07.95-3.83.95Z" />
              <path d="M14.93 4.4c.69-.83 1.16-1.96 1.04-3.1-.99.05-2.16.65-2.85 1.48-.62.74-1.18 1.92-1.04 3.05 1.07.08 2.16-.55 2.85-1.43Z" />
            </svg>
            from apple pay
          </span>
        ) : (
          !isEditing && disc && (
            <span class="text-xs text-text-tertiary tabular-nums">
              {formatMoneyWhole(disc.current)} discretionary
              {disc.avg !== null && (
                <> / ~{formatMoneyWhole(disc.avg)} avg</>
              )}
            </span>
          )
        )}
      </div>

      {/* Category selector */}
      <CategorySelector
        key={formKey}
        categories={categories}
        subcategories={subcategories}
        onSelect={handleSelect}
        initialCategoryId={editing?.category_id}
        confirmedSubcategoryId={pendingSubcategoryId || undefined}
      />

      <div ref={noteWrapRef} data-add-reveal>
        <NoteInput value={note} onChange={setNote} />
      </div>

      {/* Edit-mode save bar — fixed above the tab bar */}
      {isEditing && (
        <div
          class="fixed left-0 right-0 mx-auto max-w-[480px] z-40 px-4"
          style={{
            bottom: "calc(68px + env(safe-area-inset-bottom))",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          <div class="grid grid-cols-2 pt-2 pb-3" style={{ gap: 10 }}>
            <button
              ref={saveEditPress.ref}
              onPointerDown={saveEditPress.onPointerDown}
              onPointerUp={saveEditPress.onPointerUp}
              onPointerCancel={saveEditPress.onPointerCancel}
              onClick={handleSaveEdit}
              class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
              style={{
                height: 48,
                borderRadius: 14,
                backgroundColor: "var(--color-accent)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              save
            </button>
            <button
              ref={cancelEditPress.ref}
              onPointerDown={cancelEditPress.onPointerDown}
              onPointerUp={cancelEditPress.onPointerUp}
              onPointerCancel={cancelEditPress.onPointerCancel}
              onClick={handleCancelEdit}
              class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
              style={{
                height: 48,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "var(--color-text-secondary)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm-mode save bar — fixed above the tab bar */}
      {isConfirming && (
        <div
          class="fixed left-0 right-0 mx-auto max-w-[480px] z-40 px-4"
          style={{
            bottom: "calc(68px + env(safe-area-inset-bottom))",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          {showSkipConfirm ? (
            <div class="pt-2 pb-3">
              <ConfirmDialog
                message="skip this expense? it won't be logged"
                onConfirm={async () => {
                  setShowSkipConfirm(false);
                  await handleSkipPending();
                }}
                onCancel={() => setShowSkipConfirm(false)}
              />
            </div>
          ) : (
            <div class="grid grid-cols-2 pt-2 pb-3" style={{ gap: 10 }}>
              <button
                ref={confirmPress.ref}
                onPointerDown={confirmPress.onPointerDown}
                onPointerUp={confirmPress.onPointerUp}
                onPointerCancel={confirmPress.onPointerCancel}
                onClick={handleConfirmPending}
                disabled={!pendingSubcategoryId || confirmSaving || parseCents(amount) <= 0}
                class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
                style={{
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: "var(--color-accent)",
                  opacity: !pendingSubcategoryId || confirmSaving || parseCents(amount) <= 0 ? 0.5 : 1,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {confirmSaving ? "saving..." : "confirm"}
              </button>
              <button
                ref={skipPress.ref}
                onPointerDown={skipPress.onPointerDown}
                onPointerUp={skipPress.onPointerUp}
                onPointerCancel={skipPress.onPointerCancel}
                onClick={() => setShowSkipConfirm(true)}
                class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
                style={{
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  color: "var(--color-text-secondary)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                skip
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateLabel(dateStr: string, today: Date): string {
  const date = new Date(dateStr + "T12:00:00");
  const todayStr = today.toISOString().split("T")[0];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  if (dateStr === todayStr) {
    return `today, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split("T")[0]) {
    return `yesterday, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** "today, 14:32" / "yesterday, 14:32" / "18 apr, 14:32" — for the banner subline. */
function pendingTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayKey = d.toISOString().split("T")[0];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (dayKey === todayKey) return `today ${hh}:${mm}`;
  if (dayKey === yesterday.toISOString().split("T")[0]) return `yesterday ${hh}:${mm}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${hh}:${mm}`;
}

/** "today, 14:32 apr 2026" / "18 apr 2026, 14:32" — confirm-mode date row. */
function confirmDateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const dayKey = d.toISOString().split("T")[0];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  if (dayKey === todayKey) {
    return `today, ${hh}:${mm} ${month} ${year}`;
  }
  return `${d.getDate()} ${month} ${year}, ${hh}:${mm}`;
}
