import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import type { MonthlyTrendItem } from "@/lib/analytics";

interface TrendChartProps {
  trend: MonthlyTrendItem[];
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
  selectedYear,
  selectedMonth,
  onSelect,
  accentColor,
}: TrendChartProps) {
  const selectedColor = accentColor ?? "var(--color-accent)";
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // Animate bars when data changes
  useEffect(() => {
    if (dataKey === prevKeyRef.current) return;
    prevKeyRef.current = dataKey;

    barRefs.current.forEach((barEl, index) => {
      if (!barEl) return;
      const item = trend[index];
      if (!item) return;
      const targetPx = maxTotal > 0 ? (item.total / maxTotal) * BAR_MAX_HEIGHT : 0;
      animate(
        barEl,
        { height: ["0px", `${targetPx}px`] },
        {
          type: "spring",
          stiffness: 200,
          damping: 20,
          delay: index * 0.03,
        }
      );
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
        const isSelected = item.year === selectedYear && item.month === selectedMonth;
        const targetPx = maxTotal > 0 ? (item.total / maxTotal) * BAR_MAX_HEIGHT : 0;

        return (
          <button
            key={`${item.year}-${item.month}`}
            onClick={() => onSelect(item.year, item.month)}
            class="flex flex-col items-center flex-shrink-0"
            style={{ width: 48, WebkitTapHighlightColor: "transparent" }}
          >
            {/* Value label on top */}
            <span
              class="text-[10px] tabular-nums mb-1"
              style={{ color: isSelected ? selectedColor : "var(--color-text-secondary)" }}
            >
              {formatTrendLabel(item.total)}
            </span>

            {/* Bar area — fixed height container, bar grows from bottom */}
            <div
              class="flex items-end w-full"
              style={{ height: BAR_MAX_HEIGHT, flex: "none" }}
            >
              <div
                ref={(el) => { barRefs.current[index] = el; }}
                class="w-full rounded-t-sm"
                style={{
                  height: `${targetPx}px`,
                  backgroundColor: isSelected ? selectedColor : "#4a4a52",
                  willChange: "height",
                  minHeight: item.total > 0 ? 2 : 0,
                }}
              />
            </div>

            {/* Month label below */}
            <span
              class="text-[10px] mt-1"
              style={{ color: isSelected ? selectedColor : "var(--color-text-tertiary)" }}
            >
              {monthLabel(item.year, item.month)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
