import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import type { Expense, Category, Subcategory } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { DetailSheet } from "@/components/DetailSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { editingExpense } from "@/lib/editing";
import { parseCents, formatCents } from "@/components/AmountInput";
import { sync } from "@/sync/engine";
import { historyFilter } from "@/lib/filters";
import { useEntrance, animateRowEntrance } from "@/lib/entrance";
import { fadeRemoveRow } from "@/lib/dissolve";
import { usePressScale } from "@/lib/usePressScale";
import { formatMoney, formatEur, dateKey as toDateKey, todayKey, MONTHS_SHORT } from "@/lib/format";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_DAYS = 60;
const INCREMENT_DAYS = 60;

const USER_STYLES: Array<{ id: string; bg: string; text: string; label: string; name: string }> = [
  { id: "00000000-0000-0000-0000-000000000001", bg: "#1a3066", text: "#6c9cff", label: "B", name: "Alice" },
  { id: "00000000-0000-0000-0000-000000000002", bg: "#2d1a52", text: "#9775fa", label: "Y", name: "Bob" },
];

const DEFAULT_USER_COLOR = { bg: "#1a3066", text: "#6c9cff", label: "?", name: "?" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLabel(key: string): string {
  const today = new Date();
  const todayK = todayKey();

  if (key === todayK) return "today";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split("T")[0];

  if (key === yesterdayKey) return "yesterday";

  const d = new Date(key + "T12:00:00");
  const suffix = d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${suffix}`;
}

function formatFullDate(key: string): string {
  const d = new Date(key + "T12:00:00");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function getUserStyle(userId: string): { bg: string; text: string; label: string; name: string } {
  for (const style of USER_STYLES) {
    if (style.id === userId) return style;
  }
  const initial = (userId ?? "?")[0]?.toUpperCase() ?? "?";
  return { ...DEFAULT_USER_COLOR, label: initial, name: userId };
}

interface DayGroup {
  dateKey: string;
  expenses: Expense[];
  total: number;
}

function groupByDay(expenses: Expense[]): DayGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = toDateKey(e.timestamp);
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  // Sort keys descending
  const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
  return keys.map((dateKey) => {
    const items = map.get(dateKey)!;
    // Sort within day by full timestamp descending (most recent first)
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const total = items.reduce((s, e) => s + e.amount, 0);
    return { dateKey, expenses: items, total };
  });
}

function matchesSearch(
  expense: Expense,
  query: string,
  categoryMap: Map<string, Category>,
  subcategoryMap: Map<string, Subcategory>
): boolean {
  const q = query.toLowerCase();
  const cat = categoryMap.get(expense.category_id);
  const sub = subcategoryMap.get(expense.subcategory_id);
  const amount = formatEur(expense.amount).toLowerCase();
  return (
    (cat?.name ?? "").toLowerCase().includes(q) ||
    (sub?.name ?? "").toLowerCase().includes(q) ||
    (expense.note ?? "").toLowerCase().includes(q) ||
    amount.includes(q)
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      class="flex items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: "#1a1a22" }}
    >
      {/* Magnifying glass */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-secondary)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="flex-shrink-0"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        placeholder="search expenses…"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        class="flex-1 bg-transparent text-sm outline-none"
        style={{ color: "var(--color-text-primary)" }}
      />

      {value && (
        <button
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          class="flex-shrink-0 p-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Expense row ───────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense: Expense;
  category?: Category;
  subcategory?: Subcategory;
  onTap: () => void;
}

function ExpenseRow({ expense, category, subcategory, onTap }: ExpenseRowProps) {
  const iconKey = (category?.icon ?? "other").toLowerCase();
  const IconComponent = categoryIcons[iconKey] ?? categoryIcons["other"];
  const color = category?.color ?? "#868e96";

  // Determine user style — Alice and Bob hardcoded by user_id heuristic
  const style = getUserStyle(expense.user_id);
  const userLabel = style.label;

  const isRecurring = expense.source === "recurring";
  const isPending = expense.sync_status === "pending";

  const press = usePressScale<HTMLButtonElement>(0.97);

  return (
    <button
      ref={press.ref}
      data-row
      data-expense-id={expense.id}
      onClick={onTap}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      class="w-full text-left flex items-center gap-3 px-1 rounded-xl"
      style={{ WebkitTapHighlightColor: "transparent", paddingTop: 10, paddingBottom: 10 }}
    >
      {/* Icon + text — animated together */}
      <div data-row-text class="flex items-center gap-3 flex-1 min-w-0">
        {/* Category icon + user badge */}
        <div class="flex-shrink-0 relative" style={{ width: 36, height: 36 }}>
          <div
            class="flex items-center justify-center rounded-xl"
            style={{
              width: 36,
              height: 36,
              backgroundColor: color + "22",
            }}
          >
            <IconComponent color={color} size={18} />
          </div>
          {/* User initial badge */}
          <div
            class="absolute flex items-center justify-center rounded-full font-bold"
            style={{
              width: 16,
              height: 16,
              fontSize: 8,
              lineHeight: 1,
              bottom: -3,
              right: -3,
              backgroundColor: style.bg,
              color: style.text,
              border: "1.5px solid #0c0d12",
            }}
          >
            {userLabel}
          </div>
        </div>

        {/* Labels: category · subcategory */}
        <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-base">
            <span style={{ color: "var(--color-text-secondary)" }}>{category?.name ?? "other"}</span>
            <span style={{ color: "var(--color-text-muted)" }}> · </span>
            <span class="font-medium" style={{ color: "var(--color-text-body)" }}>{subcategory?.name ?? "expense"}</span>
          </span>
          {isRecurring && (
            <span
              class="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: "rgba(94,92,230,0.18)",
                color: "#9775fa",
              }}
            >
              recurring
            </span>
          )}
          {isPending && !isRecurring && (
            <span
              class="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: "rgba(255,159,10,0.15)",
                color: "#ff9f0a",
              }}
            >
              pending
            </span>
          )}
        </div>
        {expense.note && (
          <p class="text-sm truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            {expense.note}
          </p>
        )}
        </div>
      </div>

      {/* Amount — no currency prefix */}
      <span data-row-amount class="flex-shrink-0 text-base font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
        {formatMoney(expense.amount)}
      </span>
    </button>
  );
}

// ── Day group header ──────────────────────────────────────────────────────────

interface DayHeaderProps {
  dateKey: string;
  total: number;
}

function DayHeader({ dateKey, total }: DayHeaderProps) {
  return (
    <div data-row class="flex flex-col gap-1 pt-5 pb-1">
      <div data-row-text class="flex items-center justify-between px-1">
        <span class="text-sm font-semibold tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          {formatDateLabel(dateKey)}
        </span>
        <span data-row-amount class="text-sm tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
          {formatEur(total)}
        </span>
      </div>
      <div class="h-px w-full bg-accent opacity-30" />
    </div>
  );
}

// ── Detail sheet content ──────────────────────────────────────────────────────

interface ExpenseDetailProps {
  expense: Expense;
  category?: Category;
  subcategory?: Subcategory;
  onClose: () => void;
}

function ExpenseDetail({ expense, category, subcategory, onClose }: ExpenseDetailProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { route } = useLocation();

  const iconKey = (category?.icon ?? "other").toLowerCase();
  const IconComponent = categoryIcons[iconKey] ?? categoryIcons["other"];
  const color = category?.color ?? "#868e96";

  // Quick-edit inputs are always rendered (never swapped in on tap). That way
  // the first tap lands on a real <input> and focuses it within the user
  // gesture — iOS won't open the keyboard if focus() fires after a React
  // re-render, because by then the gesture window has closed.
  const [amountCents, setAmountCents] = useState(expense.amount);
  const [amountText, setAmountText] = useState(formatCents(expense.amount));
  const [note, setNote] = useState(expense.note ?? "");
  const [expenseDateKey, setExpenseDateKey] = useState(toDateKey(expense.timestamp));

  const dateInputRef = useRef<HTMLInputElement>(null);

  async function persist(partial: Partial<Expense>) {
    await db.expenses.update(expense.id, {
      ...partial,
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    });
    sync().catch(console.error);
  }

  function commitAmount() {
    const cents = parseCents(amountText);
    if (cents === 0) {
      // Invalid / empty — revert to last-good value
      setAmountText(formatCents(amountCents));
      return;
    }
    const normalized = formatCents(cents);
    setAmountText(normalized);
    if (cents === amountCents) return;
    setAmountCents(cents);
    persist({ amount: cents });
  }

  function commitNote(next: string) {
    const trimmed = next.trim();
    const newVal: string | null = trimmed === "" ? null : trimmed;
    const curVal: string | null = note === "" ? null : note;
    setNote(trimmed);
    if (newVal === curVal) return;
    persist({ note: newVal });
  }

  // Date edit — preserve the time-of-day portion so within-day ordering survives.
  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    type PickerInput = HTMLInputElement & { showPicker?: () => void };
    const picker = el as PickerInput;
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
    } else {
      el.focus();
      el.click();
    }
  }
  function commitDate(newKey: string) {
    if (!newKey || newKey === expenseDateKey) return;
    const timePart = expense.timestamp.split("T")[1] ?? "12:00:00.000Z";
    const newTimestamp = `${newKey}T${timePart}`;
    setExpenseDateKey(newKey);
    persist({ timestamp: newTimestamp });
  }

  async function handleDelete() {
    const rowEl = document.querySelector<HTMLElement>(
      `[data-expense-id="${expense.id}"]`
    );
    onClose();
    if (rowEl) {
      await fadeRemoveRow(rowEl);
    }
    await db.expenses.update(expense.id, {
      deleted: 1,
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    });
    // Defer sync so the re-render triggered by any server-stamped timestamps
    // can't race the fade-out and snap the list layout.
    setTimeout(() => sync().catch(console.error), 1200);
  }

  function handleEdit() {
    editingExpense.value = {
      ...expense,
      amount: amountCents,
      note: note === "" ? null : note,
      timestamp: `${expenseDateKey}T${expense.timestamp.split("T")[1] ?? "12:00:00.000Z"}`,
    };
    onClose();
    route("/");
  }

  const userStyle = getUserStyle(expense.user_id);
  const editPress = usePressScale<HTMLButtonElement>(0.97);
  const deletePress = usePressScale<HTMLButtonElement>(0.97);

  return (
    <div class="flex flex-col gap-4">
      {/* Header: icon + amount + breadcrumb */}
      <div class="flex flex-col items-center gap-2 pt-2 pb-2">
        <div
          class="flex items-center justify-center rounded-2xl"
          style={{ width: 56, height: 56, backgroundColor: color + "22" }}
        >
          <IconComponent color={color} size={28} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={amountText}
          size={Math.max(5, amountText.length)}
          onInput={(e) => setAmountText((e.target as HTMLInputElement).value)}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          class="text-3xl font-semibold tabular-nums bg-transparent text-center outline-none border-0 p-0"
          style={{ color, caretColor: color, WebkitTapHighlightColor: "transparent" }}
        />
        <div class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {category?.name ?? "—"}
          {subcategory && (
            <span> → {subcategory.name}</span>
          )}
        </div>
      </div>

      {/* Detail rows */}
      <div
        class="flex flex-col gap-0 rounded-xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        {/* Date — tap to open native date picker */}
        <div
          class="relative flex items-center justify-between px-4 py-3 cursor-pointer"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", WebkitTapHighlightColor: "transparent" }}
          onClick={openDatePicker}
        >
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>date</span>
          <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {formatFullDate(expenseDateKey)}
          </span>
          <input
            ref={dateInputRef}
            type="date"
            value={expenseDateKey}
            onChange={(e) => commitDate((e.target as HTMLInputElement).value)}
            class="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        {/* Note — always rendered as an input so first tap focuses it */}
        <div
          class="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span class="text-sm flex-shrink-0" style={{ color: "var(--color-text-secondary)" }}>note</span>
          <input
            type="text"
            value={note}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            onBlur={(e) => commitNote((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="add a note…"
            class="flex-1 min-w-0 bg-transparent text-sm text-right outline-none border-0 p-0"
            style={{ color: "var(--color-text-primary)", WebkitTapHighlightColor: "transparent" }}
          />
        </div>

        {/* Logged by */}
        <div class="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>logged by</span>
          <div class="flex items-center gap-2">
            <div
              class="flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                width: 20,
                height: 20,
                backgroundColor: userStyle.bg,
                color: userStyle.text,
              }}
            >
              {userStyle.label}
            </div>
            <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>
              {userStyle.name}
            </span>
          </div>
        </div>

        {/* Source */}
        <DetailRow label="source" value={expense.source} />
      </div>

      {/* Action buttons */}
      {showConfirm ? (
        <ConfirmDialog
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      ) : (
        <div class="grid grid-cols-2 mt-1" style={{ gap: 10 }}>
          <button
            ref={editPress.ref}
            onPointerDown={editPress.onPointerDown}
            onPointerUp={editPress.onPointerUp}
            onPointerCancel={editPress.onPointerCancel}
            onClick={handleEdit}
            class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: "rgba(108,156,255,0.12)",
              color: "var(--color-accent)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            edit
          </button>
          <button
            ref={deletePress.ref}
            onPointerDown={deletePress.onPointerDown}
            onPointerUp={deletePress.onPointerUp}
            onPointerCancel={deletePress.onPointerCancel}
            onClick={() => setShowConfirm(true)}
            class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: "rgba(255,55,95,0.12)",
              color: "var(--color-danger)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            delete
          </button>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      class="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const [visibleDays, setVisibleDays] = useState(INITIAL_DAYS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // On mount: if a filter is set from Analytics drill-down, pre-populate search.
  // Subcategory wins when present (L3 drill), else fall back to category (L2).
  useEffect(() => {
    const f = historyFilter.value;
    if (f) {
      setSearchQuery(f.subcategory || f.category);
    }
  }, []);

  // Load all non-deleted expenses sorted by timestamp DESC
  const expenses = useLiveQuery(
    () => db.expenses
      .orderBy("timestamp")
      .reverse()
      .filter((e) => e.deleted === 0)
      .toArray(),
    []
  );

  const categories = CATEGORIES;
  const subcategories = SUBCATEGORIES;

  // Entrance animation: text slides in, then amounts fade in.
  // Re-run when rows are added (infinite scroll, filter change, initial data
  // load) so new rows get marked revealed instead of staying CSS-hidden.
  useEntrance(() => {
    if (!listRef.current) return;
    return animateRowEntrance(listRef.current);
  }, [visibleDays, searchQuery, expenses?.length]);

  // Build lookup maps
  const categoryMap = new Map<string, Category>(
    categories.map((c) => [c.id, c])
  );
  const subcategoryMap = new Map<string, Subcategory>(
    subcategories.map((s) => [s.id, s])
  );

  if (!expenses) {
    return <div class="flex flex-1" />;
  }

  // Filter and group
  const filtered = searchQuery
    ? expenses.filter((e) =>
        matchesSearch(e, searchQuery, categoryMap, subcategoryMap)
      )
    : expenses;

  const allGroups = groupByDay(filtered);

  // Limit to visibleDays
  const visibleGroups = allGroups.slice(0, visibleDays);
  const hasMore = allGroups.length > visibleDays;

  // IntersectionObserver for infinite scroll — re-attach when visibleDays changes
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleDays((d) => d + INCREMENT_DAYS);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleDays]);

  const selectedCategory = selectedExpense
    ? categoryMap.get(selectedExpense.category_id)
    : undefined;
  const selectedSubcategory = selectedExpense
    ? subcategoryMap.get(selectedExpense.subcategory_id)
    : undefined;

  const activeFilter = historyFilter.value;

  function clearFilter() {
    historyFilter.value = null;
    setSearchQuery("");
  }

  return (
    <div class="flex flex-col min-h-0 px-4 pt-2 safe-pb">
      {/* Search bar */}
      <div class="pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "var(--color-bg-primary)" }}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {/* Filter chip — shown when a drill-down filter is active */}
        {activeFilter && (
          <div class="flex items-center gap-2 mt-2">
            <button
              onClick={clearFilter}
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              <span>{activeFilter.category}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {visibleGroups.length === 0 && (
        <div class="flex flex-1 items-center justify-center py-16">
          <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {searchQuery ? "no matching expenses" : "no expenses yet"}
          </p>
        </div>
      )}

      {/* Day groups */}
      <div ref={listRef}>
        {visibleGroups.map((group) => (
          <div key={group.dateKey}>
            <DayHeader dateKey={group.dateKey} total={group.total} />
            <div class="flex flex-col">
              {group.expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  category={categoryMap.get(expense.category_id)}
                  subcategory={subcategoryMap.get(expense.subcategory_id)}
                  onTap={() => setSelectedExpense(expense)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}

      {/* Detail sheet */}
      <DetailSheet
        open={selectedExpense !== null}
        onClose={() => setSelectedExpense(null)}
      >
        {selectedExpense && (
          <ExpenseDetail
            expense={selectedExpense}
            category={selectedCategory}
            subcategory={selectedSubcategory}
            onClose={() => setSelectedExpense(null)}
          />
        )}
      </DetailSheet>
    </div>
  );
}
