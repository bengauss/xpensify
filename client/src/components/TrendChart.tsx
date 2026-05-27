import { useRef, useLayoutEffect, useEffect } from "preact/hooks";
import { animate } from "motion";
import type { MonthlyTrendItem } from "@/lib/analytics";
import { springs, stagger, getReducedMotionOverride } from "@/lib/animations";
import { usePressScale } from "@/lib/usePressScale";

interface TrendChartProps {
  trend: MonthlyTrendItem[];
  /** 'month' shows monthly bars (month=1..12); 'year' shows yearly bars (month=0). */
  period?: "month" | "year";
  selectedYear: number;
  selectedMonth: number;
  onSelect: (year: number, month: number) => void;
  /** Override bar + label color for the selected month. Defaults to --color-accent. */
  accentColor?: string;
}

const MONTH_LABELS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function formatTrendLabel(cents: number): string {
  const euros = cents / 100;
  if (euros >= 1000) {
    return `${(euros / 1000).toFixed(1)}k`;
  }
  return euros.toFixed(2);
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]}'${String(year).slice(2)}`;
}

export function TrendChart({
  trend,
  period = "month",
  selectedYear,
  selectedMonth,
  onSelect,
  accentColor,
}: TrendChartProps) {
  const selectedColor = accentColor ?? "var(--color-accent)";
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dataKey = trend.map((t) => `${t.year}-${t.month}:${t.total}`).join("|") +
    `|${selectedYear}-${selectedMonth}|${selectedColor}`;
  const prevKeyRef = useRef<string>("");

  const maxTotal = trend.length > 0 ? Math.max(...trend.map((t) => t.total), 1) : 1;
  const BAR_MAX_HEIGHT = 120; // px

  // Scroll to right on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  // Animate bars when data changes.
  //
  // First render: animate each visible bar from 0 → target with a stagger.
  //   Off-screen bars snap to target immediately so we don't burn ~720ms
  //   of staggered motion on bars no one sees.
  // Subsequent data changes (month select, drill scope change): animate
  //   current → target with no stagger — motion reads the inline height left
  //   over from the previous animation and interpolates between months.
  useLayoutEffect(() => {
    if (dataKey === prevKeyRef.current) return;
    const isFirstRender = prevKeyRef.current === "";
    prevKeyRef.current = dataKey;

    const scrollEl = scrollRef.current;
    const scrollLeft = scrollEl?.scrollLeft ?? 0;
    const clientWidth = scrollEl?.clientWidth ?? Number.MAX_SAFE_INTEGER;
    // Give a small buffer so bars peeking at the edge also stagger.
    const visibleStart = scrollLeft - 24;
    const visibleEnd = scrollLeft + clientWidth + 24;

    let visibleIdx = 0;
    barRefs.current.forEach((barEl, index) => {
      if (!barEl) return;
      const item = trend[index];
      if (!item) return;
      const targetPx = maxTotal > 0 ? (item.total / maxTotal) * BAR_MAX_HEIGHT : 0;

      const btn = buttonRefs.current[index];
      const leftPos = btn?.offsetLeft ?? 0;
      const isVisible = leftPos >= visibleStart && leftPos <= visibleEnd;

      if (isFirstRender) {
        barEl.setAttribute("data-revealed", "1");
        if (isVisible) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (animate as any)(
            barEl,
            { height: ["0px", `${targetPx}px`] },
            { ...springs.data, delay: visibleIdx * stagger.bar, ...getReducedMotionOverride() },
          );
          visibleIdx++;
        } else {
          // Snap off-screen bars to target so scrolling them into view shows
          // a finished state rather than a frozen 0-px stub.
          barEl.style.height = `${targetPx}px`;
        }
      } else {
        // Bars that mounted after the first render (e.g. period switch swaps
        // the keyed children) need the attribute too, otherwise the CSS
        // `height: 0 !important` rule keeps the new bars invisible.
        const justMounted = !barEl.hasAttribute("data-revealed");
        barEl.setAttribute("data-revealed", "1");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (animate as any)(
          barEl,
          justMounted ? { height: ["0px", `${targetPx}px`] } : { height: `${targetPx}px` },
          { ...springs.data, ...getReducedMotionOverride() },
        );
      }
    });
  }, [dataKey]);

  if (trend.length === 0) {
    return (
      <div class="py-4 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
        no data yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      class="flex flex-row gap-2 overflow-x-auto"
      style={{ scrollbarWidth: "none" }}
    >
      {trend.map((item, index) => {
        const isSelected = period === "year"
          ? item.year === selectedYear
          : item.year === selectedYear && item.month === selectedMonth;
        return (
          <TrendBar
            key={period === "year" ? `y-${item.year}` : `${item.year}-${item.month}`}
            item={item}
            period={period}
            isSelected={isSelected}
            selectedColor={selectedColor}
            barMaxHeight={BAR_MAX_HEIGHT}
            onSelect={onSelect}
            buttonRefCallback={(el) => { buttonRefs.current[index] = el; }}
            barRefCallback={(el) => { barRefs.current[index] = el; }}
          />
        );
      })}
    </div>
  );
}

interface TrendBarProps {
  item: MonthlyTrendItem;
  period: "month" | "year";
  isSelected: boolean;
  selectedColor: string;
  barMaxHeight: number;
  onSelect: (year: number, month: number) => void;
  buttonRefCallback: (el: HTMLButtonElement | null) => void;
  barRefCallback: (el: HTMLDivElement | null) => void;
}

function TrendBar({
  item,
  period,
  isSelected,
  selectedColor,
  barMaxHeight,
  onSelect,
  buttonRefCallback,
  barRefCallback,
}: TrendBarProps) {
  const press = usePressScale<HTMLButtonElement>(0.97);

  // Selected bar gets a glossy gradient + outer glow. When drilled,
  // selectedColor is a category hex, so derive the glow from it (8-digit
  // hex alpha); otherwise use the accent gradient + accent glow.
  const isDefaultAccent = selectedColor.startsWith("var(");
  const selectedBg = isDefaultAccent
    ? "linear-gradient(180deg, #7eabff 0%, #6c9cff 100%)"
    : `linear-gradient(180deg, ${selectedColor} 0%, ${selectedColor} 100%)`;
  const selectedGlow = isDefaultAccent
    ? "0 6px 18px -6px rgba(108,156,255,0.55)"
    : `0 6px 18px -6px ${selectedColor}8c`;

  const isYearMode = period === "year";
  const isInProgressYear = isYearMode && item.year === new Date().getFullYear();
  const label = isYearMode
    ? (isInProgressYear ? `${item.year} ytd` : String(item.year))
    : monthLabel(item.year, item.month);
  const barWidth = isYearMode ? 60 : 48;
  // Honest signal that this year isn't done yet: dim the fill.
  const barOpacity = isInProgressYear ? 0.55 : 1;

  return (
    <button
      ref={(el) => {
        buttonRefCallback(el);
        (press.ref as { current: HTMLButtonElement | null }).current = el;
      }}
      onClick={() => onSelect(item.year, item.month)}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      class="flex flex-col items-center flex-shrink-0"
      style={{ width: barWidth, WebkitTapHighlightColor: "transparent" }}
    >
      {/* Value label on top */}
      <span
        class="tabular-nums mb-1"
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          color: isSelected ? selectedColor : "#808086",
        }}
      >
        {formatTrendLabel(item.total)}
      </span>

      {/* Bar area — fixed height container, bar grows from bottom */}
      <div
        class="flex items-end w-full"
        style={{ height: barMaxHeight, flex: "none" }}
      >
        {/* Bar height is owned by motion; CSS default (data-trend-bar
            without data-revealed) hides at 0 so the first paint doesn't
            flash the full target before motion kicks in. */}
        <div
          ref={barRefCallback}
          data-trend-bar
          class="w-full"
          style={{
            background: isSelected
              ? selectedBg
              : "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
            opacity: barOpacity,
            willChange: "height",
            minHeight: item.total > 0 ? 2 : 0,
            borderRadius: "8px 8px 4px 4px",
            boxShadow: isSelected
              ? `inset 0 1px 0 rgba(255,255,255,0.3), ${selectedGlow}`
              : "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        />
      </div>

      {/* Period label below */}
      <span
        class="mt-1 tabular-nums"
        style={{
          fontSize: 11.5,
          letterSpacing: "0.01em",
          color: isSelected ? "#a0a0a6" : "#808086",
        }}
      >
        {label}
      </span>
    </button>
  );
}
