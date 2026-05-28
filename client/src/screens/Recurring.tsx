import { useRef, useEffect, useState, useLayoutEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { animate } from "motion";
import { springs, durations, stagger, tempo, getReducedMotionOverride } from "@/lib/animations";
import { db } from "@/db/local";
import type { RecurringTemplate, Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { api } from "@/lib/api";
import { useEntrance, animateRowEntrance } from "@/lib/entrance";
import { useCountUp } from "@/lib/useCountUp";
import { usePressScale } from "@/lib/usePressScale";
import { formatMoney, formatEur, MONTHS_SHORT } from "@/lib/format";
import { categoriesSignal, subcategoriesSignal } from "@/lib/categories";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_LONG = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

function monthName(monthIndex: number): string {
  return MONTHS_LONG[monthIndex] ?? "";
}

function scheduleText(t: RecurringTemplate): string {
  if (t.frequency === "weekly") return "every week";
  if (t.frequency === "yearly") {
    const anchor = t.start_date ?? t.next_due;
    if (anchor) {
      const [, mm, dd] = anchor.split("-").map(Number);
      const day = Number(dd);
      return `every year on ${day} ${monthName(mm - 1)}`;
    }
    return "every year";
  }
  // monthly
  const dom = t.day_of_month;
  if (dom) return `every month on the ${dom}${ordinal(dom)}`;
  return "every month";
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ── Toggle component ──────────────────────────────────────────────────────────

interface ToggleProps {
  active: boolean;
  onToggle: () => void;
}

function Toggle({ active, onToggle }: ToggleProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!knobRef.current) return;
    const targetX = active ? 16 : 0;
    // Knob slides on spring (physical motion).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(knobRef.current, { x: targetX }, { ...springs.toggle, ...getReducedMotionOverride() });
    if (trackRef.current) {
      // Track color uses duration + ease — color has no mass, springs are
      // physically meaningless for it and can read as a lagging overshoot.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (animate as any)(
        trackRef.current,
        { backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)" },
        { ...durations.exit, ...getReducedMotionOverride() },
      );
    }
  }, [active]);

  return (
    <button
      ref={trackRef}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      class="relative flex-shrink-0 rounded-full cursor-pointer border-0 p-0"
      style={{
        width: 40,
        height: 24,
        backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
      }}
      aria-label={active ? "Disable" : "Enable"}
    >
      <div
        ref={knobRef}
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          backgroundColor: "white",
        }}
      />
    </button>
  );
}

// ── Forecast card ─────────────────────────────────────────────────────────────

interface ForecastItem {
  key: string;
  name: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  already_generated: boolean;
}

interface ForecastData {
  total_remaining: number;
  upcoming_count: number;
  total_active: number;
  generated: ForecastItem[];
  upcoming: ForecastItem[];
}

function formatDayMonth(ymd: string): string {
  const [, mm, dd] = ymd.split("-").map(Number);
  const day = Number(dd);
  const month = MONTHS_SHORT[mm - 1] ?? "";
  return `${day} ${month}`;
}

function useForecast(): ForecastData | null {
  const templates = useLiveQuery(() => db.recurring_templates.toArray(), []);
  // `source` isn't indexed on the expenses table, so we can't use .where("source").
  // Filter by timestamp (indexed) to narrow to the current month, then filter
  // source/deleted in JS.
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const expenses = useLiveQuery(
    () => db.expenses.where("timestamp").startsWith(ym).toArray(),
    [ym]
  );

  if (!templates || !expenses) return null;

  const catById = new Map<string, string>();
  for (const c of categoriesSignal.value) catById.set(c.id, c.name);
  const subById = new Map<string, string>();
  for (const s of subcategoriesSignal.value) subById.set(s.id, s.name);

  function labelFor(params: {
    note: string | null;
    category_id: string;
    subcategory_id: string;
  }): string {
    if (params.note && params.note.trim()) return params.note.trim();
    const sub = subById.get(params.subcategory_id);
    if (sub) return sub;
    const cat = catById.get(params.category_id);
    if (cat) return cat;
    return "—";
  }

  const generatedExpenses: Expense[] = expenses.filter(
    (e) => e.source === "recurring" && e.deleted === 0
  );

  const generatedTemplateIds = new Set(
    generatedExpenses
      .map((e) => e.recurring_template_id)
      .filter((id): id is string => !!id)
  );

  const generated: ForecastItem[] = generatedExpenses
    .map((e) => ({
      key: e.id,
      name: labelFor({
        note: e.note,
        category_id: e.category_id,
        subcategory_id: e.subcategory_id,
      }),
      amount: e.amount,
      date: e.timestamp.slice(0, 10),
      already_generated: true,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming: ForecastItem[] = templates
    .filter(
      (t) =>
        t.active === 1 &&
        t.next_due.startsWith(ym) &&
        !generatedTemplateIds.has(t.id)
    )
    .map((t) => ({
      key: t.id,
      name: labelFor({
        note: t.note,
        category_id: t.category_id,
        subcategory_id: t.subcategory_id,
      }),
      amount: t.amount,
      date: t.next_due,
      already_generated: false,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total_remaining: upcoming.reduce((sum, u) => sum + u.amount, 0),
    upcoming_count: upcoming.length,
    total_active: templates.filter((t) => t.active === 1).length,
    generated,
    upcoming,
  };
}

function ForecastCard({ forecast }: { forecast: ForecastData }) {
  const now = new Date();
  const month = monthName(now.getMonth());
  const cardRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const [paidExpanded, setPaidExpanded] = useState(false);
  /** Flipped true when the card's entrance has played, which also unlocks
   *  useCountUp to begin counting from 0 → target. */
  const [entranceReady, setEntranceReady] = useState(false);

  // The amount text content is owned by useCountUp. When `entranceReady`
  // flips true, the hook animates 0 → forecast.total_remaining with the
  // shared count duration + easing. Later forecast updates animate from
  // the previous displayed value to the new target automatically.
  const amountRef = useCountUp<HTMLSpanElement>(
    forecast.total_remaining,
    (v) => formatMoney(v),
    { enabled: entranceReady, duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] },
  );

  const toggleExpandPress = usePressScale<HTMLButtonElement>(0.98);

  // Pin inner-element hidden state BEFORE first paint so nothing flashes at
  // its final value between render and the JS-driven animation kickoff.
  useLayoutEffect(() => {
    if (hasAnimatedRef.current) return;
    if (listRef.current) {
      const rows = listRef.current.querySelectorAll<HTMLElement>("[data-forecast-row]");
      rows.forEach((row) => {
        row.style.opacity = "0";
        row.style.transform = "translateY(6px)";
      });
    }
    if (toggleBtnRef.current) {
      toggleBtnRef.current.style.opacity = "0";
    }
  }, []);

  // Chained entrance: card fade+rise → number count-up → row stagger → toggle
  // fade. Piggybacks on `useEntrance` so it waits for any pending tab
  // transition + the shared MOUNT_DELAY — same cadence as other screens.
  useEntrance(() => {
    if (!cardRef.current || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ANIM = animate as any;

    // 1. Card fade + rise — durations.soft is the shared easeOutQuart used
    //    for chunky content reveals.
    ANIM(
      cardRef.current,
      { opacity: [0, 1], y: [10, 0] },
      { ...durations.soft, ...getReducedMotionOverride() },
    );

    // 2. Unlock count-up (useCountUp runs on the next render with the shared
    //    0.15s delay baked in).
    setEntranceReady(true);

    // 3. Row stagger — begins after the count-up has visually landed, with a
    //    brief handoff so the rows feel like a follow-on phase rather than
    //    racing the final count-up frame.
    const ROW_START = durations.count.duration + tempo.handoff / 1000;
    let rowCount = 0;
    if (listRef.current) {
      const rows = Array.from(
        listRef.current.querySelectorAll<HTMLElement>("[data-forecast-row]")
      );
      rowCount = rows.length;
      rows.forEach((row, i) => {
        ANIM(
          row,
          { opacity: [0, 1], y: [6, 0] },
          {
            duration: 0.35,
            delay: ROW_START + i * stagger.pill,
            ease: [0.22, 1, 0.36, 1],
            ...getReducedMotionOverride(),
          },
        );
      });
    }

    // 4. Toggle button tails the rows — blooms in on a spring so it doesn't
    //    just blink on. springs.data carries a slight overshoot (the same
    //    preset the trend bars use), so the pill grows a touch past full size
    //    and settles back. Pin the start scale so the spring's first frame
    //    isn't read off a computed scale(1).
    if (toggleBtnRef.current) {
      const delay = ROW_START + rowCount * stagger.pill + 0.05;
      toggleBtnRef.current.style.transform = "scale(0.8)";
      ANIM(
        toggleBtnRef.current,
        { opacity: [0, 1], scale: [0.8, 1] },
        { ...springs.data, delay, ...getReducedMotionOverride() },
      );
    }
  });

  // Height animation on expand/collapse. Measure-before-commit pattern so the
  // row list smoothly transitions between compact and full views.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || prevHeightRef.current === null) return;
    const fromH = prevHeightRef.current;
    const toH = el.offsetHeight;
    prevHeightRef.current = null;
    if (fromH === toH) return;

    el.style.overflow = "hidden";
    el.style.height = `${fromH}px`;
    void el.offsetHeight;
    el.style.transition = "height 260ms cubic-bezier(0.4,0,0.2,1)";
    el.style.height = `${toH}px`;
    const cleanup = () => {
      el.style.transition = "";
      el.style.height = "";
      el.style.overflow = "";
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup);
  }, [paidExpanded]);

  const paidCount = forecast.generated.length;
  const hasPaid = paidCount > 0;
  const hasUpcoming = forecast.upcoming.length > 0;
  const hasItems = hasPaid || hasUpcoming;
  const showGenerated = paidExpanded && hasPaid;

  function togglePaid() {
    if (listRef.current) prevHeightRef.current = listRef.current.offsetHeight;
    setPaidExpanded((e) => !e);
  }

  return (
    <div
      ref={cardRef}
      class="rounded-[18px]"
      style={{
        padding: "22px 22px 20px",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 0.5px rgba(108,156,255,0.06)",
        opacity: 0,
        transform: "translateY(10px)",
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.03em",
          color: "#909096",
          marginBottom: 2,
        }}
      >
        remaining this month
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 200,
          letterSpacing: "-0.025em",
          color: "var(--color-accent)",
          lineHeight: 1.1,
          marginBottom: 4,
        }}
      >
        EUR <span ref={amountRef}>{formatMoney(0)}</span>
      </p>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
        }}
      >
        {forecast.upcoming_count} of {forecast.total_active} expenses still due in {month}
      </p>

      {hasItems && (
        <>
          <div
            style={{
              height: 1,
              margin: "18px 0 16px",
              background:
                "linear-gradient(90deg, rgba(108,156,255,0.22), rgba(108,156,255,0.06) 50%, transparent)",
            }}
          />
          <div ref={listRef} class="flex flex-col">
            {showGenerated && forecast.generated.map((item) => (
              <ForecastRow key={item.key} item={item} dimmed />
            ))}
            {showGenerated && hasUpcoming && <div style={{ height: 8 }} />}
            {forecast.upcoming.map((item) => (
              <ForecastRow key={item.key} item={item} dimmed={false} />
            ))}
          </div>
          {hasPaid && (
            <button
              ref={(el) => {
                toggleBtnRef.current = el;
                (toggleExpandPress.ref as { current: HTMLButtonElement | null }).current = el;
              }}
              onPointerDown={toggleExpandPress.onPointerDown}
              onPointerUp={toggleExpandPress.onPointerUp}
              onPointerCancel={toggleExpandPress.onPointerCancel}
              onClick={togglePaid}
              class="inline-flex items-center border-0 cursor-pointer"
              style={{
                marginTop: 12,
                gap: 8,
                padding: "7px 12px 7px 14px",
                borderRadius: 9999,
                background: "rgba(108,156,255,0.08)",
                boxShadow: "inset 0 0 0 1px rgba(108,156,255,0.16)",
                color: "#a3bdf7",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.005em",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-expanded={paidExpanded}
            >
              {paidExpanded
                ? "hide already paid"
                : `show ${paidCount} already paid ${paidCount === 1 ? "expense" : "expenses"}`}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                style={{
                  transform: paidExpanded ? "rotate(90deg)" : "none",
                  transition: "transform 200ms ease",
                }}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ForecastRow({ item, dimmed }: { item: ForecastItem; dimmed: boolean }) {
  const nameColor = dimmed ? "var(--color-text-ghost)" : "var(--color-text-body)";
  const metaColor = dimmed ? "var(--color-text-ghost)" : "var(--color-accent)";

  return (
    <div
      data-forecast-row
      class="flex items-center justify-between"
      style={{ fontSize: 13, paddingTop: 4, paddingBottom: 4 }}
    >
      <span class="truncate" style={{ color: nameColor }}>
        {item.name}
      </span>
      <span class="tabular-nums flex-shrink-0" style={{ color: metaColor }}>
        {formatMoney(item.amount)} · {formatDayMonth(item.date)}
      </span>
    </div>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onTap,
  isLast,
}: {
  template: RecurringTemplate;
  onTap: () => void;
  isLast: boolean;
}) {
  const IconComponent = categoryIcons[template.category_icon ?? ""] ?? null;
  const color = template.category_color ?? "var(--color-accent)";
  const label = template.note || template.subcategory_name || template.category_name || "—";
  const press = usePressScale<HTMLButtonElement>(0.97);

  return (
    <button
      ref={press.ref}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      data-row
      onClick={onTap}
      class="relative flex items-center gap-3 w-full text-left px-1 py-3 cursor-pointer bg-transparent border-0"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Icon + text — animated together */}
      <div data-row-text class="flex items-center gap-3 flex-1 min-w-0">
        {/* Category icon — glass-edge tile (inset ring + top highlight in hue) */}
        <div
          class="flex-shrink-0 flex items-center justify-center rounded-xl"
          style={{
            width: 36,
            height: 36,
            backgroundColor: `${color}1c`,
            boxShadow: `inset 0 0 0 1px ${color}22, inset 0 1px 0 ${color}40`,
          }}
        >
          {IconComponent && <IconComponent color={color} size={20} />}
        </div>

        {/* Labels */}
        <div class="flex-1 min-w-0">
          <p class="text-base text-text-primary truncate" style={{ letterSpacing: "-0.005em" }}>{label}</p>
          <p class="text-sm" style={{ color: "var(--color-text-tertiary)", letterSpacing: "0.005em" }}>{scheduleText(template)}</p>
        </div>
      </div>

      {/* Amount — fades in on its own beat after the text settles, the same
          two-phase reveal as History (see animateRowEntrance). */}
      <span
        data-row-amount
        class="flex-shrink-0 text-base font-medium tabular-nums"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.015em" }}
      >
        {formatMoney(template.amount)}
      </span>

      {/* Hairline divider — fades in with the row (see animateRowEntrance). */}
      {!isLast && (
        <div
          data-row-line
          class="absolute left-0 right-0 bottom-0"
          style={{ height: "0.5px", backgroundColor: "rgba(255,255,255,0.04)" }}
        />
      )}
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecurringScreen() {
  const { route } = useLocation();
  const forecast = useForecast();
  const screenRef = useRef<HTMLDivElement>(null);
  const fabPress = usePressScale<HTMLButtonElement>(0.95);

  const allTemplates = useLiveQuery(() => db.recurring_templates.toArray(), []);

  // Template row entrance animation. The forecast card owns its own mount
  // animation (it may mount late after async data loads).
  useEntrance(() => {
    if (!screenRef.current) return;
    return animateRowEntrance(screenRef.current);
  });

  async function handleToggle(template: RecurringTemplate) {
    const newActive = template.active === 1 ? 0 : 1;

    // Optimistic local update
    await db.recurring_templates.update(template.id, { active: newActive });

    // Persist to server
    try {
      const res = await (api.api.recurring[":id"].$patch as any)({
        param: { id: template.id },
        json: { active: newActive },
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on error
      await db.recurring_templates.update(template.id, { active: template.active });
    }
  }

  if (!allTemplates) {
    return <div class="flex flex-1" />;
  }

  const byFrequency: Record<string, RecurringTemplate[]> = {
    monthly: [],
    weekly: [],
    yearly: [],
  };

  for (const t of allTemplates) {
    const freq = t.frequency as string;
    if (freq in byFrequency) {
      byFrequency[freq].push(t);
    }
  }

  // Sort each group by amount descending
  for (const freq of Object.keys(byFrequency)) {
    byFrequency[freq].sort((a, b) => b.amount - a.amount);
  }

  const sections = (["monthly", "weekly", "yearly"] as const).filter(
    (f) => byFrequency[f].length > 0
  );

  return (
    <div ref={screenRef} class="flex flex-col gap-5 px-4 pt-2 safe-pb-lg">
      {/* Forecast card */}
      {forecast && (
        <ForecastCard forecast={forecast} />
      )}

      {/* Template list */}
      {sections.length === 0 ? (
        <p class="text-text-secondary text-sm text-center py-8">
          No recurring expenses yet.
        </p>
      ) : (
        <div class="flex flex-col gap-5">
          {sections.map((freq) => {
            const total = byFrequency[freq].reduce((s, t) => s + t.amount, 0);
            return (
              <div key={freq} class="flex flex-col gap-1">
                {/* Section header is a data-row so its eyebrow, total, and
                    hairline slide in on the same cascade as the rows below,
                    rather than sitting fully drawn on tab load. */}
                <div data-row class="flex flex-col pb-1">
                  <div data-row-text>
                    <div class="flex items-center justify-between px-1">
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          letterSpacing: "0.05em",
                          color: "#909096",
                        }}
                      >
                        {freq}
                      </span>
                      <span
                        class="tabular-nums"
                        style={{ fontSize: 13, color: "#909096", letterSpacing: "-0.005em" }}
                      >
                        {formatEur(total)}
                      </span>
                    </div>
                    {/* Gradient hairline — accent on the left, dissolving to nothing. */}
                    <div
                      class="h-px w-full"
                      style={{
                        marginTop: 10,
                        background:
                          "linear-gradient(90deg, rgba(108,156,255,0.28) 0%, rgba(108,156,255,0.08) 38%, rgba(255,255,255,0.02) 100%)",
                      }}
                    />
                  </div>
                </div>
                {byFrequency[freq].map((t, i, arr) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onTap={() => route(`/recurring/edit/${t.id}`)}
                    isLast={i === arr.length - 1}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating add button — sticky to the bottom-right of the scroll
          viewport. Scrolls with content naturally; sticks once its natural
          position would fall below the scroll viewport's bottom (which is
          just above the flex-laid-out BottomNav). Negative top margin so
          the button hovers over the existing bottom padding without pushing
          layout down further. */}
      <button
        ref={fabPress.ref}
        onPointerDown={fabPress.onPointerDown}
        onPointerUp={fabPress.onPointerUp}
        onPointerCancel={fabPress.onPointerCancel}
        onClick={() => route("/recurring/new")}
        class="sticky self-end z-30 flex items-center justify-center rounded-full cursor-pointer border-0"
        style={{
          bottom: 16,
          marginTop: -48,
          marginRight: 0,
          width: 48,
          height: 48,
          background: "linear-gradient(180deg, #7eabff 0%, #6c9cff 100%)",
          color: "var(--color-bg-primary)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.18), 0 12px 32px -6px rgba(108,156,255,0.55), 0 0 0 1px rgba(108,156,255,0.2)",
          transition: "transform 100ms ease, box-shadow 200ms ease",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label="Add recurring expense"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
