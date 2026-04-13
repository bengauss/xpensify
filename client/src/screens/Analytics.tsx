import { useState, useMemo, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { historyFilter } from "@/lib/filters";
import { useEntrance } from "@/lib/entrance";
import {
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

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ── Number rolling animation via rAF ─────────────────────────────────────────

function rollNumber(
  el: HTMLElement,
  from: number,
  to: number,
  duration: number,
  delay: number,
): () => void {
  let cancelled = false;
  let rafId: number;

  const timer = setTimeout(() => {
    if (cancelled) return;
    const start = performance.now();
    function tick(now: number) {
      if (cancelled) return;
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      el.textContent = formatAmount(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }
    rafId = requestAnimationFrame(tick);
  }, delay);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    cancelAnimationFrame(rafId);
  };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { route } = useLocation();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const totalRef = useRef<HTMLSpanElement>(null);
  const avgRef = useRef<HTMLSpanElement>(null);
  const prevTotalRef = useRef<number>(-1);
  const prevAvgRef = useRef<number>(-1);
  const cancelAnims = useRef<(() => void)[]>([]);
  const readyRef = useRef(false);

  // Wait for entrance delay before starting any animations
  useEntrance(() => { readyRef.current = true; });

  const allExpenses = useLiveQuery(
    () => db.expenses.filter((e) => e.deleted === 0).toArray(),
    []
  );
  const allCategories = useLiveQuery(() => db.categories.toArray(), []);

  const analytics = useMemo(() => {
    if (!allExpenses || !allCategories) return null;

    const catMap = new Map(allCategories.map((c) => [c.id, c]));
    const ym = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    const { year: prevYear, month: prevMonth } = prevYearMonth(selectedYear, selectedMonth);
    const ymPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    const currentTotal = allExpenses
      .filter((e) => e.timestamp.startsWith(ym))
      .reduce((s, e) => s + e.amount, 0);

    const prevTotal = allExpenses
      .filter((e) => e.timestamp.startsWith(ymPrev))
      .reduce((s, e) => s + e.amount, 0);

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

    const days = daysInMonth(selectedYear, selectedMonth);
    const dailyAvg = days > 0 ? Math.round(currentTotal / days) : 0;

    return { currentTotal, prevTotal, breakdown, trend, dailyAvg };
  }, [allExpenses, allCategories, selectedYear, selectedMonth]);

  // Rolling number animation — waits for entrance delay on initial load
  useEffect(() => {
    if (!analytics || !readyRef.current) return;

    // Cancel previous animations
    for (const cancel of cancelAnims.current) cancel();
    cancelAnims.current = [];

    const newTotal = analytics.currentTotal;
    const newAvg = analytics.dailyAvg;
    const oldTotal = prevTotalRef.current < 0 ? 0 : prevTotalRef.current;
    const oldAvg = prevAvgRef.current < 0 ? 0 : prevAvgRef.current;

    if (totalRef.current) {
      cancelAnims.current.push(
        rollNumber(totalRef.current, oldTotal, newTotal, 400, 0)
      );
    }
    if (avgRef.current) {
      cancelAnims.current.push(
        rollNumber(avgRef.current, oldAvg, newAvg, 400, 100)
      );
    }

    prevTotalRef.current = newTotal;
    prevAvgRef.current = newAvg;

    return () => {
      for (const cancel of cancelAnims.current) cancel();
      cancelAnims.current = [];
    };
  }, [analytics?.currentTotal, analytics?.dailyAvg]);

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

  function handleCategoryTap(categoryId: string) {
    if (allCategories) {
      const cat = allCategories.find((c) => c.id === categoryId);
      if (cat) {
        historyFilter.value = {
          category: cat.name,
          month: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`,
        };
      }
    }
    route("/history");
  }

  const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  const days = daysInMonth(selectedYear, selectedMonth);
  const currentTotal = analytics?.currentTotal ?? 0;
  const prevTotal = analytics?.prevTotal ?? 0;
  const diff = currentTotal - prevTotal;
  const pct = formatPct(currentTotal, prevTotal);
  const isLess = diff <= 0;

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
          <div class="flex gap-3">
            {/* Total spent */}
            <div
              class="flex-1 rounded-xl p-4 flex flex-col gap-1"
              style={{ backgroundColor: "var(--color-bg-surface)" }}
            >
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                total spent
              </span>
              <span
                ref={totalRef}
                class="tabular-nums"
                style={{ fontSize: 28, fontWeight: 300, color: "var(--color-text-primary)" }}
              >
                {formatAmount(0)}
              </span>
              {prevTotal > 0 && (
                <span
                  style={{ fontSize: 13, color: isLess ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {isLess ? "↓" : "↑"} {pct} {isLess ? "less" : "more"}
                </span>
              )}
              {prevTotal === 0 && (
                <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                  no prev. data
                </span>
              )}
            </div>

            {/* Daily average */}
            <div
              class="flex-1 rounded-xl p-4 flex flex-col gap-1"
              style={{ backgroundColor: "var(--color-bg-surface)" }}
            >
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                daily average
              </span>
              <span
                ref={avgRef}
                class="tabular-nums"
                style={{ fontSize: 28, fontWeight: 300, color: "var(--color-text-primary)" }}
              >
                {formatAmount(0)}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                over {days} days
              </span>
            </div>
          </div>

          {/* Category breakdown */}
          <div
            class="rounded-xl p-4"
            style={{ backgroundColor: "var(--color-bg-surface)" }}
          >
            <span
              class="tracking-wider block mb-3"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}
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
              class="tracking-wider block mb-3"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}
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
