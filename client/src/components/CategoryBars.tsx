import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import type { CategoryBreakdownItem } from "@/lib/analytics";

interface CategoryBarsProps {
  breakdown: CategoryBreakdownItem[];
  onCategoryTap?: (categoryId: string) => void;
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CategoryBars({ breakdown, onCategoryTap }: CategoryBarsProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
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
    <div class="flex flex-col gap-3">
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
              class="flex-shrink-0 text-right truncate"
              style={{
                width: 100,
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              {item.category_name}
            </span>

            {/* Bar track */}
            <div
              class="flex-1 overflow-hidden"
              style={{ height: 20, borderRadius: 6, backgroundColor: "var(--color-text-ghost)" }}
            >
              <div
                ref={(el) => { barRefs.current[index] = el; }}
                class="h-full"
                style={{
                  width: `${targetPct}%`,
                  borderRadius: 6,
                  backgroundColor: item.category_color,
                  willChange: "width",
                }}
              />
            </div>

            {/* Amount — right-aligned, no wrap */}
            <span
              class="flex-shrink-0 tabular-nums text-right"
              style={{
                minWidth: 70,
                whiteSpace: "nowrap",
                fontSize: 14,
                fontWeight: 500,
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
