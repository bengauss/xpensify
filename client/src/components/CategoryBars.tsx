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
  const amountRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const dataKey = breakdown.map((b) => `${b.category_id}:${b.total}`).join("|");
  const prevKeyRef = useRef<string>("");
  const activeAnims = useRef<{ stop: () => void }[]>([]);
  const fadeTimers = useRef<number[]>([]);

  const maxTotal = breakdown.length > 0 ? breakdown[0].total : 1;

  useEffect(() => {
    if (dataKey === prevKeyRef.current) return;
    prevKeyRef.current = dataKey;

    // Cancel any in-progress animations & timers
    for (const a of activeAnims.current) a.stop();
    activeAnims.current = [];
    for (const t of fadeTimers.current) clearTimeout(t);
    fadeTimers.current = [];

    const barCount = breakdown.length;

    // Hide all amounts and reset position
    amountRefs.current.forEach((el) => {
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(6px)";
      }
    });

    // Animate bars from 0% to target
    barRefs.current.forEach((barEl, index) => {
      if (!barEl || index >= barCount) return;
      const targetPct = maxTotal > 0 ? (breakdown[index].total / maxTotal) * 100 : 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anim = (animate as any)(
        barEl,
        { width: ["0%", `${targetPct}%`] },
        {
          type: "spring",
          stiffness: 200,
          damping: 20,
          delay: index * 0.03,
        }
      );
      activeAnims.current.push(anim);
    });

    // Staggered fade-in of amounts: bottom to top, overlapping
    // Start after bars have mostly settled (~350ms after last bar starts)
    const barsSettleBase = barCount * 30 + 350;
    const staggerMs = 40; // overlap between items

    for (let i = 0; i < barCount; i++) {
      // bottom-to-top: last item fades in first
      const reverseIndex = barCount - 1 - i;
      const delay = barsSettleBase + reverseIndex * staggerMs;

      const timer = window.setTimeout(() => {
        const el = amountRefs.current[i];
        if (!el) return;
        el.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, delay);

      fadeTimers.current.push(timer);
    }

    return () => {
      for (const t of fadeTimers.current) clearTimeout(t);
      fadeTimers.current = [];
    };
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
      {breakdown.map((item, index) => (
        <button
          key={item.category_id}
          onClick={() => onCategoryTap?.(item.category_id)}
          class="w-full flex items-center gap-2 text-left"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {/* Category name */}
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
                width: "0%",
                borderRadius: 6,
                backgroundColor: item.category_color,
                willChange: "width",
              }}
            />
          </div>

          {/* Amount — starts hidden, staggered fade+slide from bottom to top */}
          <span
            ref={(el) => { amountRefs.current[index] = el; }}
            class="flex-shrink-0 tabular-nums text-right"
            style={{
              minWidth: 70,
              whiteSpace: "nowrap",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--color-text-primary)",
              opacity: 0,
              transform: "translateY(6px)",
            }}
          >
            {formatAmount(item.total)}
          </span>
        </button>
      ))}
    </div>
  );
}
