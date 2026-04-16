import { useRef, useEffect, useState, useLayoutEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { animate } from "motion";
import { springs, durations, stagger, getReducedMotionOverride } from "@/lib/animations";
import { db } from "@/db/local";
import type { RecurringTemplate, Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { api } from "@/lib/api";
import { useEntrance, animateRowEntrance } from "@/lib/entrance";
import { useCountUp } from "@/lib/useCountUp";
import { usePressScale } from "@/lib/usePressScale";
import { formatMoney, formatEur, MONTHS_SHORT } from "@/lib/format";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";

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
  for (const c of CATEGORIES) catById.set(c.id, c.name);
  const subById = new Map<string, string>();
  for (const s of SUBCATEGORIES) subById.set(s.id, s.name);

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

    // 3. Row stagger — begins after the count-up has visually landed.
    const ROW_START = 0.6;
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

    // 4. Toggle button tails the rows.
    if (toggleBtnRef.current) {
      const delay = ROW_START + rowCount * stagger.pill + 0.05;
      ANIM(
        toggleBtnRef.current,
        { opacity: [0, 1] },
        { duration: 0.3, delay, ease: [0.22, 1, 0.36, 1], ...getReducedMotionOverride() },
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
      class="rounded-2xl border"
      style={{
        padding: "16px 20px",
        backgroundColor: "rgba(108,156,255,0.06)",
        borderColor: "rgba(108,156,255,0.12)",
        opacity: 0,
        transform: "translateY(10px)",
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          marginBottom: 2,
        }}
      >
        remaining this month
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 300,
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
              transform: "scaleY(0.5)",
              transformOrigin: "center",
              backgroundColor: "rgba(108,156,255,0.1)",
              marginTop: 12,
              marginBottom: 12,
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
              class="w-full text-left bg-transparent border-0 cursor-pointer"
              style={{
                marginTop: 10,
                padding: 0,
                fontSize: 12,
                color: "var(--color-text-hint)",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-expanded={paidExpanded}
            >
              {paidExpanded
                ? "hide already paid"
                : `show ${paidCount} already paid ${paidCount === 1 ? "expense" : "expenses"}`}
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
}: {
  template: RecurringTemplate;
  onTap: () => void;
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
      class="flex items-center gap-3 w-full text-left px-1 py-2.5 cursor-pointer bg-transparent border-0"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Icon + text — animated together */}
      <div data-row-text class="flex items-center gap-3 flex-1 min-w-0">
        {/* Category icon */}
        <div
          class="flex-shrink-0 flex items-center justify-center rounded-xl"
          style={{ width: 36, height: 36, backgroundColor: `${color}1a` }}
        >
          {IconComponent && <IconComponent color={color} size={20} />}
        </div>

        {/* Labels */}
        <div class="flex-1 min-w-0">
          <p class="text-base text-text-primary truncate">{label}</p>
          <p class="text-sm text-text-secondary">{scheduleText(template)}</p>
        </div>
      </div>

      {/* Amount */}
      <span
        data-row-amount
        class="flex-shrink-0 text-base font-medium tabular-nums"
        style={{ color: "var(--color-text-primary)" }}
      >
        {formatMoney(template.amount)}
      </span>
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
                <div class="flex flex-col gap-1 pb-1">
                  <div class="flex items-center justify-between px-1">
                    <span
                      class="text-sm font-semibold tracking-wider"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {freq}
                    </span>
                    <span
                      class="text-sm tabular-nums"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {formatEur(total)}
                    </span>
                  </div>
                  <div class="h-px w-full bg-accent opacity-30" />
                </div>
                {byFrequency[freq].map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onTap={() => route(`/recurring/edit/${t.id}`)}
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
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-primary)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,156,255,0.35)",
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
