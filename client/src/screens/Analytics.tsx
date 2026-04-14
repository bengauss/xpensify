import { useState, useMemo, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { historyFilter } from "@/lib/filters";
import { analyticsDrilldown } from "@/lib/analyticsDrilldown";
import { useEntrance } from "@/lib/entrance";
import {
  type CategoryBreakdownItem,
  type MonthlyTrendItem,
} from "@/lib/analytics";
import { CategoryBars } from "@/components/CategoryBars";
import { TrendChart } from "@/components/TrendChart";
import { formatMoney } from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
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
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      el.textContent = formatMoney(current);
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

// ── Top notes (Level 3) ──────────────────────────────────────────────────────

interface TopNote {
  note: string;
  count: number;
  total: number;
}

interface TopNotesListProps {
  notes: TopNote[];
}

function TopNotesList({ notes }: TopNotesListProps) {
  if (notes.length === 0) {
    return (
      <div class="py-4 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
        no entries this month
      </div>
    );
  }
  return (
    <div class="flex flex-col gap-2">
      {notes.map((n) => (
        <div
          key={n.note}
          class="flex items-center justify-between"
          style={{ fontSize: 13 }}
        >
          <span
            class="truncate flex-1"
            style={{ color: "var(--color-text-primary)" }}
          >
            {n.note}
          </span>
          <span
            class="tabular-nums"
            style={{ width: 90, textAlign: "right", color: "var(--color-text-tertiary)" }}
          >
            {n.count} {n.count === 1 ? "entry" : "entries"}
          </span>
          <span
            class="tabular-nums"
            style={{ width: 80, textAlign: "right", fontWeight: 500, color: "var(--color-text-primary)" }}
          >
            {formatMoney(n.total)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { route } = useLocation();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const drill = analyticsDrilldown.value;
  const drillLevel: 1 | 2 | 3 = drill ? (drill.subcategoryId ? 3 : 2) : 1;

  // Reset drill-down when leaving the Analytics tab
  useEffect(() => {
    return () => {
      analyticsDrilldown.value = null;
    };
  }, []);

  const totalRef = useRef<HTMLSpanElement>(null);
  const avgRef = useRef<HTMLSpanElement>(null);
  const prevTotalRef = useRef<number>(-1);
  const prevAvgRef = useRef<number>(-1);
  const cancelAnims = useRef<(() => void)[]>([]);
  const [entranceReady, setEntranceReady] = useState(false);

  useEntrance(() => { setEntranceReady(true); });

  const allExpenses = useLiveQuery(
    () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 24, 1).toISOString();
      return db.expenses
        .where("timestamp")
        .aboveOrEqual(start)
        .filter((e) => e.deleted === 0)
        .toArray();
    },
    []
  );
  const allCategories = useLiveQuery(() => db.categories.toArray(), []);
  const allSubcategories = useLiveQuery(() => db.subcategories.toArray(), []);

  const analytics = useMemo(() => {
    if (!allExpenses || !allCategories || !allSubcategories) return null;

    const catMap = new Map(allCategories.map((c) => [c.id, c]));
    const subMap = new Map(allSubcategories.map((s) => [s.id, s]));
    const ym = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    const { year: prevYear, month: prevMonth } = prevYearMonth(selectedYear, selectedMonth);
    const ymPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // Scope the full expense set once based on drill-down
    const scoped = allExpenses.filter((e) => {
      if (drill?.categoryId && e.category_id !== drill.categoryId) return false;
      if (drill?.subcategoryId && e.subcategory_id !== drill.subcategoryId) return false;
      return true;
    });

    const currentTotal = scoped
      .filter((e) => e.timestamp.startsWith(ym))
      .reduce((s, e) => s + e.amount, 0);

    const prevTotal = scoped
      .filter((e) => e.timestamp.startsWith(ymPrev))
      .reduce((s, e) => s + e.amount, 0);

    // Breakdown — depends on level
    let breakdown: CategoryBreakdownItem[] = [];
    let topNotes: TopNote[] = [];

    if (drillLevel === 1) {
      const catTotals = new Map<string, number>();
      for (const e of scoped) {
        if (!e.timestamp.startsWith(ym)) continue;
        catTotals.set(e.category_id, (catTotals.get(e.category_id) ?? 0) + e.amount);
      }
      for (const [category_id, total] of catTotals) {
        const cat = catMap.get(category_id);
        breakdown.push({
          category_id,
          category_name: cat?.name ?? "other",
          category_color: cat?.color ?? "#868e96",
          total,
        });
      }
      breakdown.sort((a, b) => b.total - a.total);
    } else if (drillLevel === 2) {
      const parent = catMap.get(drill!.categoryId!);
      const parentColor = parent?.color ?? "#868e96";
      const subTotals = new Map<string, number>();
      for (const e of scoped) {
        if (!e.timestamp.startsWith(ym)) continue;
        subTotals.set(e.subcategory_id, (subTotals.get(e.subcategory_id) ?? 0) + e.amount);
      }
      for (const [subcategory_id, total] of subTotals) {
        const sub = subMap.get(subcategory_id);
        breakdown.push({
          category_id: subcategory_id,
          category_name: sub?.name ?? "other",
          category_color: parentColor,
          total,
        });
      }
      breakdown.sort((a, b) => b.total - a.total);
    } else {
      // Level 3: top notes for this subcategory
      const noteTotals = new Map<string, { count: number; total: number }>();
      for (const e of scoped) {
        if (!e.timestamp.startsWith(ym)) continue;
        const key = e.note?.trim() || "(no note)";
        const ex = noteTotals.get(key) ?? { count: 0, total: 0 };
        noteTotals.set(key, { count: ex.count + 1, total: ex.total + e.amount });
      }
      topNotes = [...noteTotals.entries()]
        .map(([note, { count, total }]) => ({ note, count, total }))
        .sort((a, b) => b.total - a.total);
    }

    // Trend — scoped
    const trendTotals = new Map<string, number>();
    for (const e of scoped) {
      const key = e.timestamp.slice(0, 7);
      trendTotals.set(key, (trendTotals.get(key) ?? 0) + e.amount);
    }
    const trend: MonthlyTrendItem[] = [];
    for (const [key, total] of trendTotals) {
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

    return { currentTotal, prevTotal, breakdown, topNotes, trend, dailyAvg };
  }, [
    allExpenses,
    allCategories,
    allSubcategories,
    selectedYear,
    selectedMonth,
    drill?.categoryId,
    drill?.subcategoryId,
    drillLevel,
  ]);

  // Rolling number animation — waits for entrance delay on initial load.
  // Also re-rolls from 0 on drill changes so the scoped totals animate.
  useEffect(() => {
    if (!analytics || !entranceReady) return;

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
  }, [analytics?.currentTotal, analytics?.dailyAvg, entranceReady]);

  // Reset roll baseline when drill changes so the next roll starts from 0
  useEffect(() => {
    prevTotalRef.current = -1;
    prevAvgRef.current = -1;
  }, [drill?.categoryId, drill?.subcategoryId]);

  // ── Crossfade content on drill-level change ───────────────────────────────
  const contentRef = useRef<HTMLDivElement>(null);
  const prevDrillKeyRef = useRef<string>("L1");
  const drillKey = drill
    ? drill.subcategoryId
      ? `L3:${drill.categoryId}:${drill.subcategoryId}`
      : `L2:${drill.categoryId}`
    : "L1";

  useEffect(() => {
    if (prevDrillKeyRef.current === drillKey) return;
    prevDrillKeyRef.current = drillKey;
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.opacity = "0";
    void el.offsetHeight;
    el.style.transition = "opacity 150ms ease";
    el.style.opacity = "1";
  }, [drillKey]);

  // ── Event handlers ────────────────────────────────────────────────────────

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

  function handleItemTap(id: string) {
    if (drillLevel === 1) {
      analyticsDrilldown.value = { categoryId: id };
    } else if (drillLevel === 2) {
      analyticsDrilldown.value = { categoryId: drill!.categoryId, subcategoryId: id };
    }
    // Level 3 bars aren't tappable (top notes list, not bars)
  }

  function handleBack() {
    if (drillLevel === 3) {
      analyticsDrilldown.value = { categoryId: drill!.categoryId };
    } else {
      analyticsDrilldown.value = null;
    }
  }

  function handleViewInHistory() {
    if (!drill || !allCategories || !allSubcategories) return;
    const cat = allCategories.find((c) => c.id === drill.categoryId);
    if (!cat) return;
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    if (drill.subcategoryId) {
      const sub = allSubcategories.find((s) => s.id === drill.subcategoryId);
      historyFilter.value = {
        category: cat.name,
        subcategory: sub?.name,
        month: monthStr,
      };
    } else {
      historyFilter.value = { category: cat.name, month: monthStr };
    }
    route("/history");
  }

  // ── Derived UI values ─────────────────────────────────────────────────────

  const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
  const prevMonthName = MONTH_NAMES[prevYearMonth(selectedYear, selectedMonth).month - 1];

  const days = daysInMonth(selectedYear, selectedMonth);
  const currentTotal = analytics?.currentTotal ?? 0;
  const prevTotal = analytics?.prevTotal ?? 0;
  const diff = currentTotal - prevTotal;
  const pct = formatPct(currentTotal, prevTotal);
  const isLess = diff <= 0;

  const drillCategory = drill?.categoryId
    ? allCategories?.find((c) => c.id === drill.categoryId)
    : null;
  const drillSubcategory = drill?.subcategoryId
    ? allSubcategories?.find((s) => s.id === drill.subcategoryId)
    : null;
  const drillColor = drillCategory?.color ?? "var(--color-accent)";

  const scopeLabel =
    drillLevel === 3
      ? drillSubcategory?.name ?? "subcategory"
      : drillLevel === 2
        ? drillCategory?.name ?? "category"
        : null;

  const crumb =
    drillLevel === 3
      ? `${drillCategory?.name ?? ""} · ${drillSubcategory?.name ?? ""}`
      : drillLevel === 2
        ? drillCategory?.name ?? ""
        : "";

  const totalCardLabel = scopeLabel ? `${scopeLabel} this month` : "total spent";
  const barsHeader = drillLevel === 2 ? "by subcategory" : drillLevel === 3 ? "top notes" : "by category";

  return (
    <div
      class="flex flex-col gap-4 px-4 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      {/* Month selector — always visible, works at any drill level */}
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

      {/* Back / breadcrumb row — only in drill levels. Slide-in from left. */}
      <BackRow
        visible={drillLevel > 1}
        crumb={crumb}
        color={drillColor}
        onBack={handleBack}
      />

      {/* Loading state */}
      {(!allExpenses || !allCategories || !allSubcategories) && (
        <div class="flex items-center justify-center py-12">
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            loading…
          </span>
        </div>
      )}

      {/* Content — crossfades on drill change */}
      {analytics && (
        <div ref={contentRef} class="flex flex-col gap-4">
          {/* Summary cards */}
          <div class="flex gap-3">
            <div
              class="flex-1 rounded-xl p-4 flex flex-col gap-1"
              style={{ backgroundColor: "var(--color-bg-surface)" }}
            >
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {totalCardLabel}
              </span>
              <span
                ref={totalRef}
                class="tabular-nums"
                style={{ fontSize: 28, fontWeight: 300, color: "var(--color-text-primary)" }}
              >
                {formatMoney(0)}
              </span>
              {prevTotal > 0 && (
                <span
                  style={{ fontSize: 13, color: isLess ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {isLess ? "↓" : "↑"} {pct}
                  {drillLevel === 1 ? ` ${isLess ? "less" : "more"}` : ` vs ${prevMonthName}`}
                </span>
              )}
              {prevTotal === 0 && (
                <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                  no prev. data
                </span>
              )}
            </div>

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
                {formatMoney(0)}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                over {days} days
              </span>
            </div>
          </div>

          {/* Breakdown / top notes */}
          <div
            class="rounded-xl p-4"
            style={{ backgroundColor: "var(--color-bg-surface)" }}
          >
            <span
              class="tracking-wider block mb-3"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}
            >
              {barsHeader}
            </span>
            {drillLevel === 3 ? (
              <TopNotesList notes={analytics.topNotes} />
            ) : (
              <CategoryBars
                key={drillKey}
                breakdown={analytics.breakdown}
                onCategoryTap={handleItemTap}
                enabled={entranceReady}
              />
            )}
          </div>

          {/* Trend chart */}
          <div
            class="rounded-xl"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              padding: "16px 16px 12px 16px",
            }}
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
              accentColor={drillLevel > 1 ? drillColor : undefined}
            />
          </div>

          {/* View-in-history link — levels 2 and 3 */}
          {drillLevel > 1 && (
            <button
              onClick={handleViewInHistory}
              class="self-end bg-transparent border-0 cursor-pointer"
              style={{
                fontSize: 12,
                color: "var(--color-text-hint)",
                WebkitTapHighlightColor: "transparent",
                padding: "4px 0",
              }}
            >
              view in history →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Back / breadcrumb row ─────────────────────────────────────────────────────

interface BackRowProps {
  visible: boolean;
  crumb: string;
  color: string;
  onBack: () => void;
}

function BackRow({ visible, crumb, color, onBack }: BackRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // mounted lags `visible` so the exit animation can play before unmount.
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(visible);
  const lastCrumb = useRef(crumb);
  const lastColor = useRef(color);

  // Keep last-rendered crumb/color so the exit animation shows them while
  // parent state has already transitioned to the next level.
  if (visible) {
    lastCrumb.current = crumb;
    lastColor.current = color;
  }

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Next frame, trigger the slide-in
      requestAnimationFrame(() => setShown(true));
    } else if (mounted) {
      setShown(false);
      const t = setTimeout(() => setMounted(false), 180);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  const displayCrumb = visible ? crumb : lastCrumb.current;
  const displayColor = visible ? color : lastColor.current;

  return (
    <div
      ref={rowRef}
      class="flex items-center justify-between"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateX(0)" : "translateX(-12px)",
        transition: "opacity 180ms ease, transform 180ms ease",
      }}
    >
      <button
        onClick={onBack}
        class="flex items-center gap-2 bg-transparent border-0 cursor-pointer"
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: displayColor,
          padding: "2px 4px 2px 0",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span aria-hidden="true">←</span>
        <span>{displayCrumb}</span>
      </button>
    </div>
  );
}
