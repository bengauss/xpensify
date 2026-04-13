import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import type { CategoryBreakdownItem } from "@/lib/analytics";

interface CategoryBarsProps {
  breakdown: CategoryBreakdownItem[];
  onCategoryTap?: (categoryId: string) => void;
}

function formatAmount(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

export function CategoryBars({ breakdown, onCategoryTap }: CategoryBarsProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Track a key representing the current data to re-trigger animations
  const dataKey = breakdown.map((b) => `${b.category_id}:${b.total}`).join("|");
  const prevKeyRef = useRef<string>("");

  const maxTotal = breakdown.length > 0 ? breakdown[0].total : 1;

  useEffect(() => {
    if (dataKey === prevKeyRef.current) return;
    prevKeyRef.current = dataKey;

    barRefs.current.forEach((barEl, index) => {
      if (!barEl) return;
      const targetPct = maxTotal > 0 ? (breakdown[index].total / maxTotal) * 100 : 0;
      animate(
        barEl,
        { width: ["0%", `${targetPct}%`] },
        {
          type: "spring",
          stiffness: 200,
          damping: 20,
          delay: index * 0.03,
        }
      );
    });
  }, [dataKey]);

  if (breakdown.length === 0) {
    return (
      <div class="py-4 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
        no expenses this month
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-2">
      {breakdown.map((item, index) => {
        const targetPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
        return (
          <button
            key={item.category_id}
            onClick={() => onCategoryTap?.(item.category_id)}
            class="w-full flex items-center gap-2 text-left"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* Category name — fixed width, right-aligned */}
            <span
              class="flex-shrink-0 text-xs text-right truncate"
              style={{
                width: 80,
                color: "var(--color-text-secondary)",
              }}
            >
              {item.category_name}
            </span>

            {/* Bar track */}
            <div
              class="flex-1 rounded-full overflow-hidden"
              style={{ height: 8, backgroundColor: "var(--color-text-ghost)" }}
            >
              <div
                ref={(el) => { barRefs.current[index] = el; }}
                class="h-full rounded-full"
                style={{
                  width: `${targetPct}%`,
                  backgroundColor: item.category_color,
                  willChange: "width",
                }}
              />
            </div>

            {/* Amount — right-aligned */}
            <span
              class="flex-shrink-0 text-xs tabular-nums text-right"
              style={{
                width: 72,
                color: "var(--color-text-primary)",
              }}
            >
              {formatAmount(item.total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
