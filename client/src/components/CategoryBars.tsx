import { useRef, useState, useLayoutEffect } from "preact/hooks";
import { animate } from "motion";
import type { CategoryBreakdownItem } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { springs, stagger, tempo, getReducedMotionOverride } from "@/lib/animations";

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

  // Animate once per mount. Analytics uses key={drillKey}, so drilling in
  // remounts us and replays the entrance. Month switches within a drill level
  // don't remount — they just re-render with new data, and we snap instantly.
  const hasAnimatedRef = useRef(false);

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

    // Stop any in-flight animations / pending fades from a previous run.
    for (const a of activeAnims.current) a.stop();
    activeAnims.current = [];
    for (const t of fadeTimers.current) clearTimeout(t);
    fadeTimers.current = [];

    if (hasAnimatedRef.current) {
      // Post-initial render: snap bars and amounts to final state, no animation.
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const bar = barRefs.current[index];
        const amt = amountRefs.current[index];
        const targetPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
        if (bar) {
          bar.style.width = `${targetPct}%`;
          bar.setAttribute("data-revealed", "1");
        }
        if (amt) {
          amt.style.transition = "";
          amt.style.opacity = "1";
          amt.style.transform = "translateY(0)";
          amt.setAttribute("data-revealed", "1");
        }
      }
      return;
    }

    // First render with data on this mount: staggered entrance animation.
    const barsSettleBase = items.length * stagger.bar * 1000 + tempo.settle;
    const amountStaggerMs = 40;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const bar = barRefs.current[index];
      const amt = amountRefs.current[index];
      const targetPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;

      if (bar) {
        bar.setAttribute("data-revealed", "1");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anim = (animate as any)(
          bar,
          { width: ["0%", `${targetPct}%`] },
          { ...springs.data, delay: index * stagger.bar, ...getReducedMotionOverride() },
        );
        activeAnims.current.push(anim);
      }

      if (amt) {
        // Amount stagger is intentionally reversed (top row fades last) as a
        // design choice — see animation review #9.
        const reverseIndex = items.length - 1 - index;
        const delay = barsSettleBase + reverseIndex * amountStaggerMs;
        const timer = window.setTimeout(() => {
          amt.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
          amt.style.opacity = "1";
          amt.style.transform = "translateY(0)";
          amt.setAttribute("data-revealed", "1");
        }, delay);
        fadeTimers.current.push(timer);
      }
    }

    hasAnimatedRef.current = true;

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

            {/* Bar track — faint background + inset hairline so the fill reads
                as a material layered on top. Height kept at 20px (touch target). */}
            <div
              class="flex-1 overflow-hidden"
              style={{
                height: 20,
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.025)",
                boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.02)",
              }}
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
                  background: `linear-gradient(180deg, ${item.category_color} 0%, ${item.category_color}d8 100%)`,
                  boxShadow: `inset 0 1px 0 ${item.category_color}40, 0 1px 6px -2px ${item.category_color}80`,
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
            color: "#909096",
            letterSpacing: "0.01em",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {expanded ? (
            "show less"
          ) : (
            <>
              {extra} more {extra === 1 ? "category" : "categories"}
              <span style={{ marginLeft: 6, opacity: 0.55 }}>›</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
