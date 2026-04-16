import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { animate } from "motion";
import { durations, getReducedMotionOverride } from "@/lib/animations";
import { db } from "@/db/local";
import type { Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput, parseCents, formatCents, type AmountInputCelebrateApi } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { NoteInput } from "@/components/NoteInput";
import { currentUser } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { useLocation } from "preact-iso";
import { formatMoneyWhole, monthKey } from "@/lib/format";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";
import { editingExpense } from "@/lib/editing";
import { useEntrance } from "@/lib/entrance";
import { markSaved } from "@/lib/lastSaved";
import { usePressScale } from "@/lib/usePressScale";

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
  const { path, route } = useLocation();

  const [amount, setAmount] = useState(editing ? formatCents(editing.amount) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [dateStr, setDateStr] = useState(
    editing ? editing.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  // Pending category/subcategory selection — only used in edit mode, so the user
  // can change multiple fields before committing via the save button.
  const [pendingCategoryId, setPendingCategoryId] = useState<string>(editing?.category_id ?? "");
  const [pendingSubcategoryId, setPendingSubcategoryId] = useState<string>(editing?.subcategory_id ?? "");
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
  // Intentionally no press-scale on the date button: animating transform on
  // the click target during pointerup breaks the iOS user-activation chain
  // that `HTMLInputElement.showPicker()` relies on, so the native calendar
  // never opens. Keep it plain click-only.

  // Re-focus input when navigating back to Add tab
  useEffect(() => {
    if (path === "/") {
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [path]);

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
    // In edit mode, tapping a subcategory only selects it — commit happens via save button.
    if (isEditing) {
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

    const expenseId = crypto.randomUUID();
    await db.expenses.add({
      id: expenseId,
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
      sync_status: "pending",
      created_at: now,
      updated_at: now,
    });

    // Glow this row briefly if the user navigates to History within 3s.
    markSaved(expenseId);

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

    // Mark this row so History's ExpenseRow applies the just-saved-glow on
    // arrival — same mechanism used for new adds. No toast/banner on edit
    // save; the glowing row in History IS the confirmation.
    markSaved(editing.id);

    editingExpense.value = null;
    sync().catch(console.error);
    route("/history");
  }

  function handleCancelEdit() {
    editingExpense.value = null;
    route("/history");
  }

  return (
    <div class={`flex flex-col gap-4 px-4 pt-2 ${isEditing ? "pb-40" : "safe-pb"}`}>
      <div ref={amountWrapRef} data-add-reveal>
        <AmountInput
          value={amount}
          onChange={setAmount}
          inputRef={amountRef}
          celebrateRef={amountCelebrateRef}
        />
      </div>

      {/* Date label + discretionary counter */}
      <div
        ref={dateLineRef}
        data-add-reveal
        class="flex items-center justify-between px-1"
      >
        {/* Date — tappable to open picker; "editing · …" prefix in edit mode.
            No press-scale here on purpose — see comment next to the refs. */}
        <div class="relative">
          <button
            onClick={() => dateInputRef.current?.showPicker()}
            class="text-xs bg-transparent border-0 cursor-pointer p-0"
            style={{ color: isEditing ? "var(--color-text-secondary)" : "var(--color-text-tertiary)" }}
          >
            {isEditing ? `editing · ${dateLabel}` : dateLabel}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={dateStr}
            onInput={(e) => setDateStr((e.target as HTMLInputElement).value)}
            class="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
            style={{ colorScheme: "dark" }}
          />
        </div>

        {/* Discretionary spend counter — hidden in edit mode */}
        {!isEditing && disc && (
          <span class="text-xs text-text-tertiary tabular-nums">
            {formatMoneyWhole(disc.current)} discretionary
            {disc.avg !== null && (
              <> / ~{formatMoneyWhole(disc.avg)} avg</>
            )}
          </span>
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
