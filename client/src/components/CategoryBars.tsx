import { useRef, useEffect, useState, useLayoutEffect } from "preact/hooks";
import { animate } from "motion";
import type { CategoryBreakdownItem } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";

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

  useEffect(() => {
    if (!enabled) return;

    // Data changed (month switch, new expenses) → full reset + re-animate.
    if (dataSig !== dataSigRef.current) {
      dataSigRef.current = dataSig;
      animatedIdsRef.current.clear();

      for (const a of activeAnims.current) a.stop();
      activeAnims.current = [];
      for (const t of fadeTimers.current) clearTimeout(t);
      fadeTimers.current = [];

      // Reset inline state on every rendered row so the animation starts clean.
      for (let i = 0; i < barRefs.current.length; i++) {
        const bar = barRefs.current[i];
        if (bar) bar.style.width = "0%";
        const amt = amountRefs.current[i];
        if (amt) {
          amt.style.transition = "none";
          amt.style.opacity = "0";
          amt.style.transform = "translateY(6px)";
        }
      }
    }

    // Animate only rows whose category hasn't been animated yet. This means
    // expanding the list doesn't retract + re-animate the already-visible top 6.
    let pendingIdx = 0;
    const pendingCount = items.filter((it) => !animatedIdsRef.current.has(it.category_id)).length;
    const barsSettleBase = pendingCount * 30 + 350;
    const staggerMs = 40;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (animatedIdsRef.current.has(item.category_id)) continue;
      animatedIdsRef.current.add(item.category_id);

      const bar = barRefs.current[index];
      if (bar) {
        const targetPct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anim = (animate as any)(
          bar,
          { width: ["0%", `${targetPct}%`] },
          {
            type: "spring",
            stiffness: 200,
            damping: 20,
            delay: pendingIdx * 0.03,
          }
        );
        activeAnims.current.push(anim);
      }

      const amt = amountRefs.current[index];
      if (amt) {
        const reverseIndex = pendingCount - 1 - pendingIdx;
        const delay = barsSettleBase + reverseIndex * staggerMs;
        const timer = window.setTimeout(() => {
          amt.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
          amt.style.opacity = "1";
          amt.style.transform = "translateY(0)";
        }, delay);
        fadeTimers.current.push(timer);
      }

      pendingIdx++;
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
