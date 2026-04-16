import { useRef, useEffect, useState, useLayoutEffect } from "preact/hooks";
import { animate } from "motion";
import type { CategoryBreakdownItem } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { springs, stagger, getReducedMotionOverride } from "@/lib/animations";

interface CategoryBarsProps {
  breakdown: CategoryBreakdownItem[];
  onCategoryTap?: (categoryId: string) => void;
  /** When false, bars stay at width 0 and amounts hidden. Set to true to trigger animations. */
  enabled?: boolean;
  /** Max bars to show before surfacing a "show more" link. */
  maxCollapsed?: number;
}

export function CategoryBars({
  breakdown,
  onCategoryTap,
  enabled = true,
  maxCollapsed = 6,
}: CategoryBarsProps) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);

  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const amountRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activeAnims = useRef<{ stop: () => void }[]>([]);
  const fadeTimers = useRef<number[]>([]);

  const animatedIdsRef = useRef(new Set<string>());
  const dataSigRef = useRef<string>("");

  const canCollapse = breakdown.length > maxCollapsed;
  const items = !canCollapse || expanded ? breakdown : breakdown.slice(0, maxCollapsed);
  const extra = breakdown.length - maxCollapsed;

  const maxTotal = breakdown.length > 0 ? breakdown[0].total : 1;
  const dataSig = breakdown.map((b) => `${b.category_id}:${b.total}`).join("|");
  const visibleSig = items.map((b) => b.category_id).join("|");

  // Height animation on expand/collapse. Measure prev height from the click
  // handler, then animate to the new post-render height.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || prevHeightRef.current === null) return;
    const fromH = prevHeightRef.current;
    const toH = el.offsetHeight;
    prevHeightRef.current = null;
    if (fromH === toH) return;

    el.style.overflow = "hidden";
    el.style.height = `${fromH}px`;
    // Force reflow before transition to pin starting height.
    void el.offsetHeight;
    el.style.transition = "height 280ms cubic-bezier(0.4,0,0.2,1)";
    el.style.height = `${toH}px`;
    const cleanup = () => {
      el.style.transition = "";
      el.style.height = "";
      el.style.overflow = "";
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup);
  }, [expanded]);

  // useLayoutEffect so imperative style writes land before paint — avoids a
  // 0% flash on re-renders where Preact would otherwise commit the JSX default
  // before motion takes over.
  useLayoutEffect(() => {
    if (!enabled) return;

    const dataChanged = dataSig !== dataSigRef.current;
    if (dataChanged) {
      dataSigRef.current = dataSig;
      // Stop in-flight bar animations — fresh calls below pick up from current width.
      for (const a of activeAnims.current) a.stop();
      activeAnims.current = [];
    }

    let newCategoryIdx = 0;
    const newCategoryCount = items.filter((it) => !animatedIdsRef.current.has(it.category_id)).length;
    const barsSettleBase = newCategoryCount * 30 + 350;
    const amountStaggerMs = 40;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const bar = barRefs.current[index];
      const amt = amountRefs.current[index];
      const targetPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
      const firstTime = !animatedIdsRef.current.has(item.category_id);

      if (bar) {
        if (firstTime) {
          bar.setAttribute("data-revealed", "1");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anim = (animate as any)(
            bar,
            { width: ["0%", `${targetPct}%`] },
            { ...springs.data, delay: newCategoryIdx * stagger.bar, ...getReducedMotionOverride() },
          );
          activeAnims.current.push(anim);
        } else {
          // Animate current → new. Motion reads the inline width set by the
          // previous animation; no reset to 0 between months.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anim = (animate as any)(
            bar,
            { width: `${targetPct}%` },
            { ...springs.data, ...getReducedMotionOverride() },
          );
          activeAnims.current.push(anim);
        }
      }

      if (amt && firstTime) {
        // Amount stagger is intentionally reversed (top row fades last) as a
        // design choice — see animation review #9.
        const reverseIndex = newCategoryCount - 1 - newCategoryIdx;
        const delay = barsSettleBase + reverseIndex * amountStaggerMs;
        const timer = window.setTimeout(() => {
          amt.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
          amt.style.opacity = "1";
          amt.style.transform = "translateY(0)";
          amt.setAttribute("data-revealed", "1");
        }, delay);
        fadeTimers.current.push(timer);
      }

      if (firstTime) {
        animatedIdsRef.current.add(item.category_id);
        newCategoryIdx++;
      }
    }

    return () => {
      for (const t of fadeTimers.current) clearTimeout(t);
      fadeTimers.current = [];
    };
  }, [dataSig, visibleSig, enabled]);

  function toggle() {
    if (listRef.current) prevHeightRef.current = listRef.current.offsetHeight;
    setExpanded((e) => !e);
  }

  if (breakdown.length === 0) {
    return (
      <div class="py-4 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
        no expenses this month
      </div>
    );
  }

  return (
    <div>
      <div ref={listRef} class="flex flex-col gap-3">
        {items.map((item, index) => (
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
              style={{ height: 20, borderRadius: 6 }}
            >
              {/* Bar fill — width is owned by motion; CSS default (data-bar-fill
                  without data-revealed) hides at 0% until the first animation
                  marks it revealed. */}
              <div
                ref={(el) => { barRefs.current[index] = el; }}
                data-bar-fill
                class="h-full"
                style={{
                  borderRadius: 6,
                  backgroundColor: item.category_color,
                  willChange: "width",
                }}
              />
            </div>

            {/* Amount — opacity + transform owned by CSS (data-bar-amount)
                until the fade-in completes and flips data-revealed. */}
            <span
              ref={(el) => { amountRefs.current[index] = el; }}
              data-bar-amount
              class="flex-shrink-0 tabular-nums text-right"
              style={{
                minWidth: 70,
                whiteSpace: "nowrap",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              {formatMoney(item.total)}
            </span>
          </button>
        ))}
      </div>

      {canCollapse && (
        <button
          onClick={toggle}
          class="w-full text-left bg-transparent border-0 cursor-pointer"
          style={{
            marginTop: 10,
            paddingLeft: 108, // align with bar start (100px name + 8px gap)
            fontSize: 12,
            color: "var(--color-text-hint)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {expanded
            ? "show less"
            : `${extra} more ${extra === 1 ? "category" : "categories"}`}
        </button>
      )}
    </div>
  );
}
