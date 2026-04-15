import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { signal } from "@preact/signals";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { db } from "@/db/local";
import type { Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput, parseCents, formatCentsDE } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { NoteInput } from "@/components/NoteInput";
import { Toast } from "@/components/Toast";
import { currentUser } from "@/lib/auth";
import { sync } from "@/sync/engine";
import { useLocation } from "preact-iso";
import { formatMoney, formatMoneyWhole, monthKey } from "@/lib/format";

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

/** Signal used by History detail sheet to put Add screen into edit mode */
export const editingExpense = signal<Expense | null>(null);

export function AddScreen() {
  const editing = editingExpense.value;
  const isEditing = !!editing;
  const { path, route } = useLocation();

  const [amount, setAmount] = useState(editing ? formatCentsDE(editing.amount) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [dateStr, setDateStr] = useState(
    editing ? editing.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [toast, setToast] = useState({ visible: false, message: "" });
  // Pending category/subcategory selection — only used in edit mode, so the user
  // can change multiple fields before committing via the save button.
  const [pendingCategoryId, setPendingCategoryId] = useState<string>(editing?.category_id ?? "");
  const [pendingSubcategoryId, setPendingSubcategoryId] = useState<string>(editing?.subcategory_id ?? "");
  // Remount key for CategorySelector — bumped after each save so the selector
  // resets to the grid view and replays its staggered entrance animation.
  const [formKey, setFormKey] = useState(0);

  const amountRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Re-focus input when navigating back to Add tab
  useEffect(() => {
    if (path === "/") {
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [path]);

  const categories = useLiveQuery(() =>
    db.categories.toArray().then((cats) => cats.sort((a, b) => a.sort_order - b.sort_order))
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray());

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
  const dataReady = categories && categories.length > 0 && subcategories && subcategories.length > 0;

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
          { duration: 0.4 }
        );
      }
      setTimeout(() => amountRef.current?.focus(), 0);
      return;
    }

    const userId = currentUser.value?.id;
    if (!userId) {
      // Auth not yet loaded — refuse to save rather than persist a row with empty user_id
      setToast({ visible: true, message: "not logged in — refresh and try again" });
      return;
    }

    const now = new Date().toISOString();
    const sub = subcategories?.find((s) => s.id === subcategoryId);

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
      sync_status: "pending",
      created_at: now,
      updated_at: now,
    });

    if (amountRef.current) {
      animate(amountRef.current, { scale: [1, 0.97, 1] }, springs.bouncy);
    }

    setToast({ visible: true, message: `✓ ${formatCentsDE(amountCents)} → ${sub?.name ?? "expense"}` });

    sync().catch(console.error);

    // Reset form
    setAmount("");
    setNote("");
    setDateStr(new Date().toISOString().split("T")[0]);
    setPendingCategoryId("");
    setPendingSubcategoryId("");
    setFormKey((k) => k + 1);

    setTimeout(() => amountRef.current?.focus(), 100);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const amountCents = parseCents(amount);
    if (amountCents <= 0) return;
    if (!pendingCategoryId || !pendingSubcategoryId) return;

    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split("T")[0];
    const timestamp = dateStr === todayStr ? now : `${dateStr}T12:00:00.000Z`;
    const sub = subcategories?.find((s) => s.id === pendingSubcategoryId);

    await db.expenses.update(editing.id, {
      amount: amountCents,
      category_id: pendingCategoryId,
      subcategory_id: pendingSubcategoryId,
      note: note.trim() || null,
      timestamp,
      updated_at: now,
      sync_status: "pending",
    });

    setToast({ visible: true, message: `✓ EUR ${formatMoney(amountCents)} → ${sub?.name ?? "expense"} updated` });
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
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast({ visible: false, message: "" })}
      />

      <AmountInput
        value={amount}
        onChange={setAmount}
        inputRef={amountRef}
      />

      {/* Date label + discretionary counter */}
      <div class="flex items-center justify-between px-1">
        {/* Date — tappable to open picker; "editing · …" prefix in edit mode */}
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
      {dataReady ? (
        <CategorySelector
          key={formKey}
          categories={categories}
          subcategories={subcategories}
          onSelect={handleSelect}
          initialCategoryId={editing?.category_id}
          confirmedSubcategoryId={pendingSubcategoryId || undefined}
        />
      ) : (
        <div class="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} class="h-16 rounded-xl bg-bg-surface animate-pulse" />
          ))}
        </div>
      )}

      <NoteInput value={note} onChange={setNote} />

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
              onClick={handleSaveEdit}
              onPointerDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
              onPointerUp={(e) => { animate(e.currentTarget, { scale: 1 }, springs.snappy); }}
              onPointerLeave={(e) => { animate(e.currentTarget, { scale: 1 }, springs.snappy); }}
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
              onClick={handleCancelEdit}
              onPointerDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
              onPointerUp={(e) => { animate(e.currentTarget, { scale: 1 }, springs.snappy); }}
              onPointerLeave={(e) => { animate(e.currentTarget, { scale: 1 }, springs.snappy); }}
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
