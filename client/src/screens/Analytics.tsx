import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { historyFilter } from "@/lib/filters";
import { analyticsDrilldown } from "@/lib/analyticsDrilldown";
import { useEntrance } from "@/lib/entrance";
import { useCountUp } from "@/lib/useCountUp";
import { usePressScale } from "@/lib/usePressScale";
import {
  type CategoryBreakdownItem,
  type MonthlyTrendItem,
} from "@/lib/analytics";
import { CategoryBars } from "@/components/CategoryBars";
import { TrendChart } from "@/components/TrendChart";
import { SegmentedPill } from "@/components/SegmentedPill";
import { formatMoney, dateKey, todayKey } from "@/lib/format";
import { categoriesSignal, subcategoriesSignal } from "@/lib/categories";

type Period = "month" | "year";
type Scope = "all" | "discretionary";

const PERIOD_KEY = "xpensify_analytics_period";
const SCOPE_KEY = "xpensify_analytics_scope";

function readStoredPeriod(): Period {
  if (typeof localStorage === "undefined") return "month";
  return localStorage.getItem(PERIOD_KEY) === "year" ? "year" : "month";
}

function readStoredScope(): Scope {
  if (typeof localStorage === "undefined") return "all";
  return localStorage.getItem(SCOPE_KEY) === "discretionary" ? "discretionary" : "all";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function formatPct(a: number, b: number): string {
  if (b === 0) return "—";
  const diff = ((a - b) / b) * 100;
  return `${Math.abs(diff).toFixed(0)}%`;
}

// Stat-card delta indicator — a softly-tinted chip with a half-pixel ring.
// Green when spend is down (isLess), red when up.
function deltaChipStyle(isLess: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 6,
    padding: "3px 9px 3px 7px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    color: isLess ? "var(--color-success)" : "var(--color-danger)",
    backgroundColor: isLess ? "rgba(105,219,124,0.10)" : "rgba(255,107,107,0.10)",
    boxShadow: isLess
      ? "inset 0 0 0 0.5px rgba(105,219,124,0.22)"
      : "inset 0 0 0 0.5px rgba(255,107,107,0.22)",
  };
}

function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ── Animated total (count-up) ───────────────────────────────────────────────
//
// Wraps `useCountUp` so a `key` change on the <AnimatedTotal> element
// remounts the hook and resets the internal prev-value ref to 0 — that's how
// we get the "re-roll from 0 on drill change" behavior (the parent keys
// on drillKey). `enabled` is used to hold at 0 during the tab transition
// and only begin the count-up once the entrance is ready.

interface AnimatedTotalProps {
  target: number;
  enabled: boolean;
  delay?: number;
  style?: Record<string, string | number>;
  class?: string;
}

function AnimatedTotal({ target, enabled, delay = 0, style, class: className }: AnimatedTotalProps) {
  const ref = useCountUp<HTMLSpanElement>(target, formatMoney, { enabled, delay });
  return (
    <span ref={ref} class={className} style={style}>
      {formatMoney(0)}
    </span>
  );
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
  const [period, setPeriodState] = useState<Period>(readStoredPeriod);
  const [scope, setScopeState] = useState<Scope>(readStoredScope);

  function setPeriod(p: Period) {
    setPeriodState(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* ignore */ }
  }
  function setScope(s: Scope) {
    setScopeState(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch { /* ignore */ }
  }

  const drill = analyticsDrilldown.value;
  const drillLevel: 1 | 2 | 3 = drill ? (drill.subcategoryId ? 3 : 2) : 1;

  // Reset drill-down when leaving the Analytics tab
  useEffect(() => {
    return () => {
      analyticsDrilldown.value = null;
    };
  }, []);

  const [entranceReady, setEntranceReady] = useState(false);

  useEntrance(() => { setEntranceReady(true); });

  const allExpenses = useLiveQuery(
    () => db.expenses.filter((e) => e.deleted === 0).toArray(),
    []
  );
  const allCategories = categoriesSignal.value;
  const allSubcategories = subcategoriesSignal.value;

  const analytics = useMemo(() => {
    if (!allExpenses) return null;

    const catMap = new Map(allCategories.map((c) => [c.id, c]));
    const subMap = new Map(allSubcategories.map((s) => [s.id, s]));

    // 1. Discretionary filter — exclude recurring-generated expenses entirely.
    let baseExpenses = allExpenses;
    if (scope === "discretionary") {
      baseExpenses = baseExpenses.filter((e) => e.source !== "recurring");
    }

    // 2. Drill-down scope.
    const scoped = baseExpenses.filter((e) => {
      if (drill?.categoryId && e.category_id !== drill.categoryId) return false;
      if (drill?.subcategoryId && e.subcategory_id !== drill.subcategoryId) return false;
      return true;
    });

    // 3. Period-aware "in current period" predicate + comparison cutoff.
    const ym = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    const yr = String(selectedYear);
    const { year: prevYear, month: prevMonth } = prevYearMonth(selectedYear, selectedMonth);
    const ymPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    const inCurrentPeriod = period === "year"
      ? (e: typeof scoped[number]) => dateKey(e.timestamp).startsWith(yr)
      : (e: typeof scoped[number]) => dateKey(e.timestamp).startsWith(ym);

    // Comparison totals. In month mode: this month vs the previous month.
    // In year mode: this year vs the prior year, both clamped to the same
    // calendar cutoff (so a partial 2026 compares to Jan 1–today 2025).
    const localNow = new Date();
    let currentTotal = 0;
    let prevTotal = 0;

    if (period === "month") {
      for (const e of scoped) {
        const ek = dateKey(e.timestamp);
        if (ek.startsWith(ym)) currentTotal += e.amount;
        else if (ek.startsWith(ymPrev)) prevTotal += e.amount;
      }
    } else {
      const isCurrentYear = selectedYear === localNow.getFullYear();
      const cutoffMd = isCurrentYear
        ? todayKey().slice(5, 10) // "MM-DD" (local)
        : "12-31";
      const cutoffYmd = `${selectedYear}-${cutoffMd}`;
      const prevCutoffYmd = `${selectedYear - 1}-${cutoffMd}`;
      for (const e of scoped) {
        const ymd = dateKey(e.timestamp);
        const y = ymd.slice(0, 4);
        if (y === yr && ymd <= cutoffYmd) currentTotal += e.amount;
        else if (y === String(selectedYear - 1) && ymd <= prevCutoffYmd) prevTotal += e.amount;
      }
    }

    // 4. Breakdown — depends on drill level. Same logic, just a period filter.
    let breakdown: CategoryBreakdownItem[] = [];
    let topNotes: TopNote[] = [];

    if (drillLevel === 1) {
      const catTotals = new Map<string, number>();
      for (const e of scoped) {
        if (!inCurrentPeriod(e)) continue;
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
        if (!inCurrentPeriod(e)) continue;
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
      const noteTotals = new Map<string, { count: number; total: number }>();
      for (const e of scoped) {
        if (!inCurrentPeriod(e)) continue;
        const key = e.note?.trim() || "(no note)";
        const ex = noteTotals.get(key) ?? { count: 0, total: 0 };
        noteTotals.set(key, { count: ex.count + 1, total: ex.total + e.amount });
      }
      topNotes = [...noteTotals.entries()]
        .map(([note, { count, total }]) => ({ note, count, total }))
        .sort((a, b) => b.total - a.total);
    }

    // 5. Trend — monthly buckets in month mode, yearly buckets in year mode.
    const trend: MonthlyTrendItem[] = [];
    if (period === "month") {
      const trendTotals = new Map<string, number>();
      for (const e of scoped) {
        const key = dateKey(e.timestamp).slice(0, 7);
        trendTotals.set(key, (trendTotals.get(key) ?? 0) + e.amount);
      }
      for (const [key, total] of trendTotals) {
        const [yearStr, monthStr] = key.split("-");
        trend.push({
          year: parseInt(yearStr, 10),
          month: parseInt(monthStr, 10),
          total,
        });
      }
      trend.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
    } else {
      const yearTotals = new Map<number, number>();
      for (const e of scoped) {
        const y = parseInt(dateKey(e.timestamp).slice(0, 4), 10);
        yearTotals.set(y, (yearTotals.get(y) ?? 0) + e.amount);
      }
      for (const [y, total] of yearTotals) {
        trend.push({ year: y, month: 0, total });
      }
      trend.sort((a, b) => a.year - b.year);
    }

    // 6. YTD card data (month mode only).
    let ytd = 0;
    let prevYtd = 0;
    if (period === "month") {
      const isCurrentCalendarMonth =
        selectedYear === localNow.getFullYear() &&
        selectedMonth === localNow.getMonth() + 1;
      const cutoffYmd = isCurrentCalendarMonth
        ? todayKey()
        : `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(
            new Date(selectedYear, selectedMonth, 0).getDate()
          ).padStart(2, "0")}`;
      const prevCutoffYmd = `${selectedYear - 1}${cutoffYmd.slice(4)}`;
      for (const e of scoped) {
        const ymd = dateKey(e.timestamp);
        const y = ymd.slice(0, 4);
        if (y === yr && ymd <= cutoffYmd) ytd += e.amount;
        else if (y === String(selectedYear - 1) && ymd <= prevCutoffYmd) prevYtd += e.amount;
      }
    }

    // 7. Monthly-avg card (year mode replacement for YTD).
    // Average across the months that have actually elapsed in the selected
    // year — so 2026 with five months in is divided by 5. Comparison uses
    // the same denominator on the prior year for an apples-to-apples ratio.
    let monthlyAvg = 0;
    let prevMonthlyAvg = 0;
    if (period === "year") {
      const isCurrentYear = selectedYear === localNow.getFullYear();
      const monthsElapsed = isCurrentYear ? localNow.getMonth() + 1 : 12;
      monthlyAvg = monthsElapsed > 0 ? Math.round(currentTotal / monthsElapsed) : 0;
      prevMonthlyAvg = monthsElapsed > 0 ? Math.round(prevTotal / monthsElapsed) : 0;
    }

    return {
      currentTotal,
      prevTotal,
      breakdown,
      topNotes,
      trend,
      ytd,
      prevYtd,
      monthlyAvg,
      prevMonthlyAvg,
    };
  }, [
    allExpenses,
    selectedYear,
    selectedMonth,
    period,
    scope,
    drill?.categoryId,
    drill?.subcategoryId,
    drillLevel,
  ]);

  // ── Drill-level change: directional slide, matching tab transition ────────
  //
  // Deeper (L1→L2 or L2→L3): content slides in from 15% right.
  // Back (L2→L1 or L3→L2): content slides in from 15% left.
  // Same level but different subtree (e.g. swap category at L2): fade only.
  const contentRef = useRef<HTMLDivElement>(null);
  const prevDrillKeyRef = useRef<string>("L1");
  const prevLevelRef = useRef<number>(drillLevel);
  const drillKey = drill
    ? drill.subcategoryId
      ? `L3:${drill.categoryId}:${drill.subcategoryId}`
      : `L2:${drill.categoryId}`
    : "L1";

  // useLayoutEffect: the "from" state must commit before paint — with useEffect
  // the browser paints one frame of new content at opacity:1, transform:0
  // before the hide fires, which shows as a flash + snap on every drill change.
  useLayoutEffect(() => {
    if (prevDrillKeyRef.current === drillKey) return;
    const oldLevel = prevLevelRef.current;
    const newLevel = drillLevel;
    prevDrillKeyRef.current = drillKey;
    prevLevelRef.current = newLevel;

    const el = contentRef.current;
    if (!el) return;

    el.style.transition = "none";
    el.style.opacity = "0";
    if (oldLevel !== newLevel) {
      const deeper = newLevel > oldLevel;
      el.style.transform = deeper ? "translateX(15%)" : "translateX(-15%)";
    } else {
      el.style.transform = "translateX(0)";
    }
    void el.offsetHeight;
    el.style.transition = "opacity 200ms ease, transform 200ms ease";
    el.style.opacity = "1";
    el.style.transform = "translateX(0)";
  }, [drillKey]);

  // Press feedback for month arrows + view-in-history
  const prevArrowPress = usePressScale<HTMLButtonElement>(0.95);
  const nextArrowPress = usePressScale<HTMLButtonElement>(0.95);
  const viewInHistoryPress = usePressScale<HTMLButtonElement>(0.97);

  // ── Event handlers ────────────────────────────────────────────────────────

  function handlePrev() {
    if (period === "year") {
      setSelectedYear((y) => y - 1);
      return;
    }
    const { year, month } = prevYearMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  function handleNext() {
    if (period === "year") {
      setSelectedYear((y) => y + 1);
      return;
    }
    const { year, month } = nextYearMonth(selectedYear, selectedMonth);
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  function handleTrendSelect(year: number, month: number) {
    setSelectedYear(year);
    if (period === "month") {
      setSelectedMonth(month);
    }
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
    if (!drill) return;
    const cat = allCategories.find((c) => c.id === drill.categoryId);
    if (!cat) return;
    // History month filter is YYYY-MM only — leave it unset in year mode so
    // the user sees the whole year for the drilled category.
    const monthStr = period === "year"
      ? undefined
      : `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
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

  const periodLabel = period === "year"
    ? String(selectedYear)
    : `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
  const prevMonthName = MONTH_NAMES[prevYearMonth(selectedYear, selectedMonth).month - 1];

  const currentTotal = analytics?.currentTotal ?? 0;
  const prevTotal = analytics?.prevTotal ?? 0;
  const diff = currentTotal - prevTotal;
  const pct = formatPct(currentTotal, prevTotal);
  const isLess = diff <= 0;

  const ytd = analytics?.ytd ?? 0;
  const prevYtd = analytics?.prevYtd ?? 0;
  const ytdPct = formatPct(ytd, prevYtd);
  const ytdIsLess = ytd - prevYtd <= 0;

  const monthlyAvg = analytics?.monthlyAvg ?? 0;
  const prevMonthlyAvg = analytics?.prevMonthlyAvg ?? 0;
  const monthlyAvgPct = formatPct(monthlyAvg, prevMonthlyAvg);
  const monthlyAvgIsLess = monthlyAvg - prevMonthlyAvg <= 0;

  const drillCategory = drill?.categoryId
    ? allCategories.find((c) => c.id === drill.categoryId)
    : null;
  const drillSubcategory = drill?.subcategoryId
    ? allSubcategories.find((s) => s.id === drill.subcategoryId)
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

  const totalCardLabel = scopeLabel
    ? `${scopeLabel} ${period === "year" ? "this year" : "this month"}`
    : "total spent";
  const ytdCardLabel = period === "year"
    ? "monthly avg"
    : (scopeLabel ? `${scopeLabel} ytd` : "year to date");
  const barsHeader = drillLevel === 2 ? "by subcategory" : drillLevel === 3 ? "top notes" : "by category";
  const trendHeader = period === "year" ? "yearly trend" : "monthly trend";

  return (
    <div
      class="flex flex-col gap-4 px-4 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      {/* Period selector + lens pills — single row to keep vertical density */}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            ref={prevArrowPress.ref}
            onPointerDown={prevArrowPress.onPointerDown}
            onPointerUp={prevArrowPress.onPointerUp}
            onPointerCancel={prevArrowPress.onPointerCancel}
            onClick={handlePrev}
            class="flex items-center justify-center rounded-full text-sm"
            style={{
              width: 34,
              height: 34,
              backgroundColor: "transparent",
              color: "var(--color-text-secondary)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.025)",
              WebkitTapHighlightColor: "transparent",
              flex: "none",
            }}
          >
            ←
          </button>

          <span
            class="text-sm font-medium tabular-nums"
            style={{
              color: "var(--color-text-primary)",
              minWidth: 96,
              textAlign: "center",
            }}
          >
            {periodLabel}
          </span>

          <button
            ref={nextArrowPress.ref}
            onPointerDown={nextArrowPress.onPointerDown}
            onPointerUp={nextArrowPress.onPointerUp}
            onPointerCancel={nextArrowPress.onPointerCancel}
            onClick={handleNext}
            class="flex items-center justify-center rounded-full text-sm"
            style={{
              width: 34,
              height: 34,
              backgroundColor: "transparent",
              color: "var(--color-text-secondary)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.025)",
              WebkitTapHighlightColor: "transparent",
              flex: "none",
            }}
          >
            →
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <SegmentedPill<Scope>
            ariaLabel="spending scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", shortLabel: "all", longLabel: "all" },
              { value: "discretionary", shortLabel: "disc.", longLabel: "discretionary" },
            ]}
          />
          <SegmentedPill<Period>
            ariaLabel="time period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "month", shortLabel: "m", longLabel: "month" },
              { value: "year", shortLabel: "y", longLabel: "year" },
            ]}
          />
        </div>
      </div>

      {/* Content — crossfades on drill change */}
      {analytics && (
        <div ref={contentRef} class="flex flex-col gap-4">
          {/* Back / breadcrumb row — lives inside contentRef so its mount/
              unmount layout shift happens while the wrapper is at opacity:0,
              not during the fade-in. */}
          {drillLevel > 1 && (
            <button
              onClick={handleBack}
              class="flex items-center gap-2 self-start bg-transparent border-0 cursor-pointer"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: drillColor,
                padding: "2px 4px 2px 0",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span aria-hidden="true">←</span>
              <span>{crumb}</span>
            </button>
          )}

          {/* Summary cards */}
          <div class="flex gap-3">
            <div
              class="flex-1 flex flex-col gap-1"
              style={{
                backgroundColor: "#13141a",
                borderRadius: 14,
                padding: "14px 14px 12px",
                boxShadow:
                  "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.03em", color: "#909096" }}>
                {totalCardLabel}
              </span>
              <AnimatedTotal
                key={`total-${drillKey}`}
                target={currentTotal}
                enabled={entranceReady}
                class="tabular-nums"
                style={{ fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em", color: "#f4f4f8" }}
              />
              {prevTotal > 0 && (
                <span style={deltaChipStyle(isLess)}>
                  {isLess ? "↓" : "↑"} {pct}
                  {period === "year"
                    ? " vs last year"
                    : drillLevel === 1
                      ? ` ${isLess ? "less" : "more"}`
                      : ` vs ${prevMonthName}`}
                </span>
              )}
              {prevTotal === 0 && (
                <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                  no prev. data
                </span>
              )}
            </div>

            <div
              class="flex-1 flex flex-col gap-1"
              style={{
                backgroundColor: "#13141a",
                borderRadius: 14,
                padding: "14px 14px 12px",
                boxShadow:
                  "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.03em", color: "#909096" }}>
                {ytdCardLabel}
              </span>
              {period === "year" ? (
                <>
                  <AnimatedTotal
                    key={`avg-${drillKey}-${selectedYear}`}
                    target={monthlyAvg}
                    enabled={entranceReady}
                    delay={0.1}
                    class="tabular-nums"
                    style={{ fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em", color: "#f4f4f8" }}
                  />
                  {prevMonthlyAvg > 0 && (
                    <span style={deltaChipStyle(monthlyAvgIsLess)}>
                      {monthlyAvgIsLess ? "↓" : "↑"} {monthlyAvgPct} vs last year
                    </span>
                  )}
                  {prevMonthlyAvg === 0 && (
                    <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                      no prev. data
                    </span>
                  )}
                </>
              ) : (
                <>
                  <AnimatedTotal
                    key={`ytd-${drillKey}`}
                    target={ytd}
                    enabled={entranceReady}
                    delay={0.1}
                    class="tabular-nums"
                    style={{ fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em", color: "#f4f4f8" }}
                  />
                  {prevYtd > 0 && (
                    <span style={deltaChipStyle(ytdIsLess)}>
                      {ytdIsLess ? "↓" : "↑"} {ytdPct} vs last year
                    </span>
                  )}
                  {prevYtd === 0 && (
                    <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                      no prev. data
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Breakdown / top notes */}
          <div
            class="rounded-xl p-4"
            style={{
              backgroundColor: "#13141a",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <span
              class="block mb-3"
              style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.03em", color: "#909096" }}
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
              backgroundColor: "#13141a",
              padding: "16px 16px 12px 16px",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <span
              class="block mb-3"
              style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.03em", color: "#909096" }}
            >
              {trendHeader}
            </span>
            <TrendChart
              trend={analytics.trend}
              period={period}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onSelect={handleTrendSelect}
              accentColor={drillLevel > 1 ? drillColor : undefined}
            />
          </div>

          {/* View-in-history link — levels 2 and 3 */}
          {drillLevel > 1 && (
            <button
              ref={viewInHistoryPress.ref}
              onPointerDown={viewInHistoryPress.onPointerDown}
              onPointerUp={viewInHistoryPress.onPointerUp}
              onPointerCancel={viewInHistoryPress.onPointerCancel}
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

