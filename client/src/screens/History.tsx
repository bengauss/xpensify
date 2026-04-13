import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import type { Expense, Category, Subcategory } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { DetailSheet } from "@/components/DetailSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { editingExpense } from "@/screens/Add";
import { sync } from "@/sync/engine";

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_DAYS = 30;
const INCREMENT_DAYS = 30;

const USER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  // fallback by username — assign by known names
  alice: { bg: "#1a3066", text: "#6c9cff", label: "B" },
  bob: { bg: "#2d1a52", text: "#9775fa", label: "Y" },
};

const DEFAULT_USER_COLOR = { bg: "#1a3066", text: "#6c9cff", label: "?" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateKey(timestamp: string): string {
  return timestamp.split("T")[0];
}

function formatAmount(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function formatDateLabel(dateKey: string): string {
  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];

  if (dateKey === todayKey) return "today";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split("T")[0];

  if (dateKey === yesterdayKey) return "yesterday";

  const d = new Date(dateKey + "T12:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatFullDate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getUserStyle(userId: string, displayName?: string): { bg: string; text: string; label: string } {
  const nameLower = (displayName ?? userId ?? "").toLowerCase();
  for (const key of Object.keys(USER_COLORS)) {
    if (nameLower.includes(key)) return USER_COLORS[key];
  }
  const initial = (displayName ?? userId ?? "?")[0]?.toUpperCase() ?? "?";
  return { ...DEFAULT_USER_COLOR, label: initial };
}

interface DayGroup {
  dateKey: string;
  expenses: Expense[];
  total: number;
}

function groupByDay(expenses: Expense[]): DayGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = getDateKey(e.timestamp);
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  // Sort keys descending
  const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
  return keys.map((dateKey) => {
    const items = map.get(dateKey)!;
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
  const amount = formatAmount(expense.amount).toLowerCase();
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

  return (
    <button
      onClick={onTap}
      class="w-full text-left flex items-center gap-3 px-1 py-2.5 rounded-xl transition-transform active:scale-[0.98]"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Category icon container */}
      <div
        class="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: 36,
          height: 36,
          backgroundColor: color + "22",
        }}
      >
        <IconComponent color={color} size={18} />
      </div>

      {/* Labels */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {subcategory?.name ?? "expense"}
          </span>
          {isRecurring && (
            <span
              class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
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
              class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
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
          <p class="text-xs truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            {expense.note}
          </p>
        )}
      </div>

      {/* User avatar */}
      <div
        class="flex-shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          width: 18,
          height: 18,
          backgroundColor: style.bg,
          color: style.text,
        }}
      >
        {userLabel}
      </div>

      {/* Amount */}
      <span class="flex-shrink-0 text-sm font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
        {formatAmount(expense.amount)}
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
    <div class="flex items-center justify-between px-1 pt-4 pb-1">
      <span class="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
        {formatDateLabel(dateKey)}
      </span>
      <span class="text-xs tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
        {formatAmount(total)}
      </span>
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
  const dateKey = getDateKey(expense.timestamp);

  async function handleDelete() {
    await db.expenses.update(expense.id, {
      deleted: 1,
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    });
    sync().catch(console.error);
    onClose();
  }

  function handleEdit() {
    editingExpense.value = expense;
    onClose();
    route("/");
  }

  const userStyle = getUserStyle(expense.user_id);

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
        <div
          class="text-3xl font-semibold tabular-nums"
          style={{ color }}
        >
          {formatAmount(expense.amount)}
        </div>
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
        {/* Date */}
        <DetailRow label="date" value={formatFullDate(dateKey)} />

        {/* Note */}
        {expense.note && <DetailRow label="note" value={expense.note} />}

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
              {userStyle.label === "B" ? "Alice" : userStyle.label === "Y" ? "Bob" : expense.user_id}
            </span>
          </div>
        </div>

        {/* Source */}
        <DetailRow label="source" value={expense.source} />
      </div>

      {/* Action buttons */}
      <div class="flex flex-col gap-2 mt-1">
        {/* Edit */}
        <button
          onClick={handleEdit}
          class="w-full py-3 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "rgba(108,156,255,0.15)",
            color: "var(--color-accent)",
          }}
        >
          edit
        </button>

        {/* Delete / confirm */}
        {showConfirm ? (
          <ConfirmDialog
            onConfirm={handleDelete}
            onCancel={() => setShowConfirm(false)}
          />
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            class="w-full py-3 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: "rgba(255,55,95,0.12)",
              color: "var(--color-danger)",
            }}
          >
            delete
          </button>
        )}
      </div>
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

  // Load all non-deleted expenses sorted by timestamp DESC
  const expenses = useLiveQuery(
    () => db.expenses
      .orderBy("timestamp")
      .reverse()
      .filter((e) => e.deleted === 0)
      .toArray(),
    []
  );

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);

  // Build lookup maps
  const categoryMap = new Map<string, Category>(
    (categories ?? []).map((c) => [c.id, c])
  );
  const subcategoryMap = new Map<string, Subcategory>(
    (subcategories ?? []).map((s) => [s.id, s])
  );

  if (!expenses || !categories || !subcategories) {
    return (
      <div class="flex flex-1 items-center justify-center px-4">
        <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>loading…</p>
      </div>
    );
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

  // IntersectionObserver for infinite scroll — re-attach when hasMore changes
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleDays((d) => d + INCREMENT_DAYS);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore]);

  const selectedCategory = selectedExpense
    ? categoryMap.get(selectedExpense.category_id)
    : undefined;
  const selectedSubcategory = selectedExpense
    ? subcategoryMap.get(selectedExpense.subcategory_id)
    : undefined;

  return (
    <div class="flex flex-col min-h-0 px-4 pb-24">
      {/* Search bar */}
      <div class="pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "var(--color-bg-primary)" }}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
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

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}

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
