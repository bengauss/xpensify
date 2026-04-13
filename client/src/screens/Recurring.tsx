import { useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { animate } from "motion";
import { db } from "@/db/local";
import type { RecurringTemplate } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { api } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function monthName(monthIndex: number): string {
  const names = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  return names[monthIndex] ?? "";
}

function scheduleText(t: RecurringTemplate): string {
  if (t.frequency === "weekly") return "every week";
  if (t.frequency === "yearly") return "every year";
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

  useEffect(() => {
    if (!knobRef.current) return;
    const targetX = active ? 16 : 0;
    animate(knobRef.current, { x: targetX }, { type: "spring", stiffness: 500, damping: 28 });
  }, [active]);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      class="relative flex-shrink-0 rounded-full cursor-pointer border-0 p-0"
      style={{
        width: 40,
        height: 24,
        backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
        transition: "background-color 200ms ease",
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

interface ForecastData {
  total_remaining: number;
  upcoming_count: number;
  total_count: number;
  items: Array<{
    id: string;
    amount: number;
    note: string | null;
    next_due: string;
    frequency: string;
    category_name: string;
    category_icon: string;
    category_color: string;
    subcategory_name: string;
    already_generated: boolean;
  }>;
}

function useForecast(): ForecastData | null | "error" {
  const templates = useLiveQuery(() => db.recurring_templates.toArray(), []);
  const expenses = useLiveQuery(
    () => db.expenses
      .where("source").equals("recurring")
      .filter((e) => {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        return e.timestamp.startsWith(ym) && e.deleted === 0;
      })
      .toArray(),
    []
  );

  if (!templates || !expenses) return null;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const generatedSet = new Set(
    expenses.filter((e) => e.recurring_template_id).map((e) => e.recurring_template_id as string)
  );

  const upcoming = templates.filter(
    (t) => t.active === 1 && t.next_due.startsWith(ym)
  );

  const totalRemaining = upcoming
    .filter((t) => !generatedSet.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    total_remaining: totalRemaining,
    upcoming_count: upcoming.filter((t) => !generatedSet.has(t.id)).length,
    total_count: upcoming.length,
    items: upcoming.map((t) => ({
      id: t.id,
      amount: t.amount,
      note: t.note,
      next_due: t.next_due,
      frequency: t.frequency,
      category_name: t.category_name ?? "",
      category_icon: t.category_icon ?? "",
      category_color: t.category_color ?? "var(--color-accent)",
      subcategory_name: t.subcategory_name ?? "",
      already_generated: generatedSet.has(t.id),
    })),
  };
}

function ForecastCard({ forecast }: { forecast: ForecastData }) {
  const now = new Date();
  const month = monthName(now.getMonth());

  return (
    <div
      class="rounded-2xl px-5 py-4 border"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
      }}
    >
      <p class="text-sm text-text-secondary mb-1">remaining this month</p>
      <p
        class="font-light mb-1"
        style={{ fontSize: 32, color: "var(--color-accent)", lineHeight: 1.1 }}
      >
        EUR {formatCents(forecast.total_remaining)}
      </p>
      <p class="text-xs text-text-secondary mb-4">
        {forecast.upcoming_count} of {forecast.total_count} expenses still due in {month}
      </p>

      {forecast.items.length > 0 && (
        <div class="flex flex-col gap-2">
          {forecast.items.map((item) => (
            <div
              key={item.id}
              class="flex items-center justify-between text-sm"
              style={{ opacity: item.already_generated ? 0.45 : 1 }}
            >
              <span
                class="text-text-body"
                style={item.already_generated ? { textDecoration: "line-through" } : {}}
              >
                {item.note || item.subcategory_name || item.category_name}
              </span>
              <span class="text-text-secondary tabular-nums">
                {item.next_due.slice(8)} · EUR {formatCents(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onTap,
  onToggle,
}: {
  template: RecurringTemplate;
  onTap: () => void;
  onToggle: () => void;
}) {
  const IconComponent = categoryIcons[template.category_icon ?? ""] ?? null;
  const color = template.category_color ?? "var(--color-accent)";
  const label = template.note || template.subcategory_name || template.category_name || "—";

  return (
    <button
      onClick={onTap}
      class="flex items-center gap-3 w-full text-left px-1 py-2 cursor-pointer bg-transparent border-0"
    >
      {/* Category icon */}
      <div
        class="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{ width: 34, height: 34, backgroundColor: `${color}1a` }}
      >
        {IconComponent && <IconComponent color={color} size={18} />}
      </div>

      {/* Labels */}
      <div class="flex-1 min-w-0">
        <p class="text-sm text-text-primary truncate">{label}</p>
        <p class="text-xs text-text-secondary">{scheduleText(template)}</p>
      </div>

      {/* Amount */}
      <span class="text-sm text-text-body tabular-nums mr-3">
        EUR {formatCents(template.amount)}
      </span>

      {/* Toggle */}
      <Toggle active={template.active === 1} onToggle={onToggle} />
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecurringScreen() {
  const { route } = useLocation();
  const forecast = useForecast();

  const allTemplates = useLiveQuery(() => db.recurring_templates.toArray(), []);

  async function handleToggle(template: RecurringTemplate) {
    const newActive = template.active === 1 ? 0 : 1;

    // Optimistic local update
    await db.recurring_templates.update(template.id, { active: newActive });

    // Persist to server
    try {
      const res = await api.api.recurring[":id"].$patch({
        param: { id: template.id },
        json: { active: newActive } as any,
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on error
      await db.recurring_templates.update(template.id, { active: template.active });
    }
  }

  if (!allTemplates) {
    return (
      <div class="flex flex-1 items-center justify-center px-4">
        <p class="text-text-secondary text-sm">loading...</p>
      </div>
    );
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
    <div class="flex flex-col gap-5 px-4 pb-28">
      {/* Forecast card */}
      {forecast && forecast !== "error" && (
        <ForecastCard forecast={forecast} />
      )}

      {/* Template list */}
      {sections.length === 0 ? (
        <p class="text-text-secondary text-sm text-center py-8">
          No recurring expenses yet.
        </p>
      ) : (
        <div class="flex flex-col gap-5">
          {sections.map((freq) => (
            <div key={freq} class="flex flex-col gap-1">
              <p class="text-xs font-semibold text-text-tertiary uppercase tracking-widest px-1 mb-1">
                {freq}
              </p>
              {byFrequency[freq].map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onTap={() => route(`/recurring/edit/${t.id}`)}
                  onToggle={() => handleToggle(t)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      <button
        onClick={() => route("/recurring/new")}
        class="w-full rounded-xl py-3 text-sm font-medium cursor-pointer border bg-transparent"
        style={{
          borderColor: "var(--color-accent)",
          color: "var(--color-accent)",
        }}
      >
        + add recurring expense
      </button>
    </div>
  );
}
