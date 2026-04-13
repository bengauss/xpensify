import { useState, useMemo } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import {
  getMonthlyTotal,
  getCategoryBreakdown,
  getMonthlyTrend,
  type CategoryBreakdownItem,
  type MonthlyTrendItem,
} from "@/lib/analytics";
import { CategoryBars } from "@/components/CategoryBars";
import { TrendChart } from "@/components/TrendChart";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatEur(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

function formatPct(a: number, b: number): string {
  if (b === 0) return "—";
  const diff = ((a - b) / b) * 100;
  return `${Math.abs(diff).toFixed(0)}%`;
}

function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  currentTotal: number;
  prevTotal: number;
  year: number;
  month: number;
}

function SummaryCards({ currentTotal, prevTotal, year, month }: SummaryCardsProps) {
  const days = daysInMonth(year, month);
  const dailyAvg = days > 0 ? Math.round(currentTotal / days) : 0;

  // vs previous month
  const diff = currentTotal - prevTotal;
  const pct = formatPct(currentTotal, prevTotal);
  const isLess = diff <= 0;

  return (
    <div class="flex gap-3">
      {/* Total spent */}
      <div
        class="flex-1 rounded-xl p-4 flex flex-col gap-1"
        style={{ backgroundColor: "var(--color-bg-surface)" }}
      >
        <span class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          total spent
        </span>
        <span
          class="text-xl font-semibold tabular-nums"
          style={{ color: "var(--color-text-primary)" }}
        >
          {formatEur(currentTotal)}
        </span>
        {prevTotal > 0 && (
          <span
            class="text-xs"
            style={{ color: isLess ? "var(--color-success)" : "var(--color-danger)" }}
          >
            {isLess ? "↓" : "↑"} {pct} {isLess ? "less" : "more"}
          </span>
        )}
        {prevTotal === 0 && (
          <span class="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            no prev. data
          </span>
        )}
      </div>

      {/* Daily average */}
      <div
        class="flex-1 rounded-xl p-4 flex flex-col gap-1"
        style={{ backgroundColor: "var(--color-bg-surface)" }}
      >
        <span class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          daily average
        </span>
        <span
          class="text-xl font-semibold tabular-nums"
          style={{ color: "var(--color-text-primary)" }}
        >
          {formatEur(dailyAvg)}
        </span>
        <span class="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          over {days} days
        </span>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { route } = useLocation();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Reactively load all expenses + categories so analytics recompute on change
  const allExpenses = useLiveQuery(
    () => db.expenses.filter((e) => e.deleted === 0).toArray(),
    []
  );
  const allCategories = useLiveQuery(() => db.categories.toArray(), []);

  // Compute analytics from raw data using useMemo
  const analytics = useMemo(() => {
    if (!allExpenses || !allCategories) return null;

    const catMap = new Map(allCategories.map((c) => [c.id, c]));
    const ym = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    const { year: prevYear, month: prevMonth } = prevYearMonth(selectedYear, selectedMonth);
    const ymPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // Current month total
    const currentTotal = allExpenses
      .filter((e) => e.timestamp.startsWith(ym))
      .reduce((s, e) => s + e.amount, 0);

    // Prev month total
    const prevTotal = allExpenses
      .filter((e) => e.timestamp.startsWith(ymPrev))
      .reduce((s, e) => s + e.amount, 0);

    // Category breakdown for current month
    const catTotals = new Map<string, number>();
    for (const e of allExpenses) {
      if (!e.timestamp.startsWith(ym)) continue;
      catTotals.set(e.category_id, (catTotals.get(e.category_id) ?? 0) + e.amount);
    }
    const breakdown: CategoryBreakdownItem[] = [];
    for (const [category_id, total] of catTotals.entries()) {
      const cat = catMap.get(category_id);
      breakdown.push({
        category_id,
        category_name: cat?.name ?? "other",
        category_color: cat?.color ?? "#868e96",
        total,
      });
    }
    breakdown.sort((a, b) => b.total - a.total);

    // Monthly trend — all months
    const trendTotals = new Map<string, number>();
    for (const e of allExpenses) {
      const key = e.timestamp.slice(0, 7);
      trendTotals.set(key, (trendTotals.get(key) ?? 0) + e.amount);
    }
    const trend: MonthlyTrendItem[] = [];
    for (const [key, total] of trendTotals.entries()) {
      const [yearStr, monthStr] = key.split("-");
      trend.push({
        year: parseInt(yearStr, 10),
        month: parseInt(monthStr, 10),
        total,
      });
    }
    trend.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

    return { currentTotal, prevTotal, breakdown, trend };
  }, [allExpenses, allCategories, selectedYear, selectedMonth]);

  function handlePrev() {
    const { year, month } = prevYearMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  function handleNext() {
    const { year, month } = nextYearMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  function handleTrendSelect(year: number, month: number) {
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  function handleCategoryTap(_categoryId: string) {
    route("/history");
  }

  const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div class="flex flex-col gap-4 px-4 pb-24 pt-2">

      {/* Month selector */}
      <div class="flex items-center justify-between">
        <button
          onClick={handlePrev}
          class="flex items-center justify-center rounded-full border text-sm"
          style={{
            width: 32,
            height: 32,
            backgroundColor: "var(--color-bg-surface)",
            borderColor: "rgba(42,42,50,0.8)",
            color: "var(--color-text-primary)",
          }}
        >
          ←
        </button>

        <span
          class="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {monthLabel}
        </span>

        <button
          onClick={handleNext}
          class="flex items-center justify-center rounded-full border text-sm"
          style={{
            width: 32,
            height: 32,
            backgroundColor: "var(--color-bg-surface)",
            borderColor: "rgba(42,42,50,0.8)",
            color: "var(--color-text-primary)",
          }}
        >
          →
        </button>
      </div>

      {/* Loading state */}
      {(!allExpenses || !allCategories) && (
        <div class="flex items-center justify-center py-12">
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            loading…
          </span>
        </div>
      )}

      {/* Content */}
      {analytics && (
        <>
          {/* Summary cards */}
          <SummaryCards
            currentTotal={analytics.currentTotal}
            prevTotal={analytics.prevTotal}
            year={selectedYear}
            month={selectedMonth}
          />

          {/* Category breakdown */}
          <div
            class="rounded-xl p-4"
            style={{ backgroundColor: "var(--color-bg-surface)" }}
          >
            <span
              class="text-xs font-medium uppercase tracking-wider block mb-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              by category
            </span>
            <CategoryBars
              breakdown={analytics.breakdown}
              onCategoryTap={handleCategoryTap}
            />
          </div>

          {/* Trend chart */}
          <div
            class="rounded-xl p-4"
            style={{ backgroundColor: "var(--color-bg-surface)" }}
          >
            <span
              class="text-xs font-medium uppercase tracking-wider block mb-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              monthly trend
            </span>
            <TrendChart
              trend={analytics.trend}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onSelect={handleTrendSelect}
            />
          </div>
        </>
      )}
    </div>
  );
}
