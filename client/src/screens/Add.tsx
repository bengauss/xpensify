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

// ── Discretionary spend helpers ──────────────────────────────────────────────

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function formatWhole(cents: number): string {
  return Math.round(cents / 100).toLocaleString("de-DE");
}

function roundToHundred(cents: number): number {
  return Math.round(cents / 10000) * 10000;
}

function computeDiscretionary(expenses: Expense[] | undefined) {
  if (!expenses) return null;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curKey = getMonthKey(curYear, curMonth);

  // Current month discretionary
  const currentTotal = expenses
    .filter((e) => e.timestamp.startsWith(curKey) && e.deleted === 0 && e.source !== "recurring")
    .reduce((s, e) => s + e.amount, 0);

  // Last 3 completed months
  let y = curYear, m = curMonth;
  const monthTotals: number[] = [];
  for (let i = 0; i < 3; i++) {
    ({ year: y, month: m } = prevMonth(y, m));
    const key = getMonthKey(y, m);
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
  const { path } = useLocation();

  const [amount, setAmount] = useState(editing ? formatCentsDE(editing.amount) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [showNote, setShowNote] = useState(!!editing?.note);
  const [dateStr, setDateStr] = useState(
    editing ? editing.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [toast, setToast] = useState({ visible: false, message: "" });

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

  // Discretionary spend counter — reactive via liveQuery
  const allExpenses = useLiveQuery(() => db.expenses.toArray());
  const disc = useMemo(() => computeDiscretionary(allExpenses), [allExpenses]);

  const today = new Date();
  const dateLabel = formatDateLabel(dateStr, today);
  const dataReady = categories && categories.length > 0 && subcategories && subcategories.length > 0;

  async function handleSelect(categoryId: string, subcategoryId: string) {
    const amountCents = parseCents(amount);
    if (amountCents <= 0) return;

    const now = new Date().toISOString();
    const sub = subcategories?.find((s) => s.id === subcategoryId);

    // Use real time for today, noon for backdated entries
    const todayStr = new Date().toISOString().split("T")[0];
    const timestamp = dateStr === todayStr ? now : `${dateStr}T12:00:00.000Z`;

    if (editing) {
      await db.expenses.update(editing.id, {
        amount: amountCents,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        note: note.trim() || null,
        timestamp,
        updated_at: now,
        sync_status: "pending",
      });
      setToast({ visible: true, message: `✓ EUR ${(amountCents / 100).toFixed(2)} → ${sub?.name ?? "expense"} updated` });
      editingExpense.value = null;
    } else {
      await db.expenses.add({
        id: crypto.randomUUID(),
        user_id: currentUser.value?.id ?? "",
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

      setToast({ visible: true, message: `✓ EUR ${(amountCents / 100).toFixed(2)} → ${sub?.name ?? "expense"} saved` });
    }

    sync().catch(console.error);

    // Reset form
    setAmount("");
    setNote("");
    setShowNote(false);
    setDateStr(new Date().toISOString().split("T")[0]);

    setTimeout(() => amountRef.current?.focus(), 100);
  }

  return (
    <div class="flex flex-col gap-4 px-4 pb-24">
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
        {/* Date — tappable to open picker */}
        <div class="relative">
          <button
            onClick={() => dateInputRef.current?.showPicker()}
            class="text-xs text-text-tertiary bg-transparent border-0 cursor-pointer p-0"
          >
            {dateLabel}
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

        {/* Discretionary spend counter */}
        {disc && (
          <span class="text-xs text-text-tertiary tabular-nums">
            {formatWhole(disc.current)} discretionary
            {disc.avg !== null && (
              <> / ~{formatWhole(disc.avg)} avg</>
            )}
          </span>
        )}
      </div>

      {/* Category selector */}
      {dataReady ? (
        <CategorySelector
          categories={categories}
          subcategories={subcategories}
          onSelect={handleSelect}
          initialCategoryId={editing?.category_id}
        />
      ) : (
        <div class="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} class="h-16 rounded-xl bg-bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {/* Expandable extras */}
      <div class="flex flex-col gap-3 px-1">
        {!showNote && (
          <button
            onClick={() => setShowNote(true)}
            class="text-base text-text-secondary self-start"
          >
            + note
          </button>
        )}
        {showNote && <NoteInput value={note} onChange={setNote} />}

      </div>
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
