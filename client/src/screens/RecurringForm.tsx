import { useState, useEffect, useRef } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { animate } from "motion";
import { springs, durations, getReducedMotionOverride } from "@/lib/animations";
import { db } from "@/db/local";
import type { RecurringTemplate } from "@/db/local";
import { AmountInput, parseCents, formatCents } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";
import { usePressScale } from "@/lib/usePressScale";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Frequency = "monthly" | "weekly" | "yearly";

// ── Main component ────────────────────────────────────────────────────────────

export default function RecurringForm({ id: idProp }: { id?: string } = {}) {
  const { route } = useLocation();
  const routeMatch = useRoute();
  // TabTransitionContainer bypasses preact-iso's <Router>, so there's no
  // RouteContext.Provider in scope — `routeMatch.params` can be undefined
  // when we reach /recurring/new without an idProp. Guard the access.
  const id: string | undefined =
    idProp ?? (routeMatch.params as Record<string, string> | undefined)?.["id"];
  const isEdit = !!id;

  // Form state
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!isEdit);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const categories = CATEGORIES;
  const subcategories = SUBCATEGORIES;

  // Load template data for edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    db.recurring_templates.get(id).then((t: RecurringTemplate | undefined) => {
      if (!t) { route("/recurring"); return; }
      setAmountStr(formatCents(t.amount));
      setCategoryId(t.category_id);
      setSubcategoryId(t.subcategory_id);
      setNote(t.note ?? "");
      setFrequency(t.frequency);
      setDayOfMonth(t.day_of_month ?? 1);
      if (t.start_date) setStartDate(t.start_date);
      setActive(t.active === 1);
      setLoaded(true);
    });
  }, [id, isEdit]);

  // Toggle refs
  const knobRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!knobRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(
      knobRef.current,
      { x: active ? 16 : 0 },
      { ...springs.toggle, ...getReducedMotionOverride() },
    );
    if (trackRef.current) {
      // Track color uses duration + ease — color has no mass, so spring
      // physics on it reads as a lagging overshoot.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (animate as any)(
        trackRef.current,
        { backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)" },
        { ...durations.exit, ...getReducedMotionOverride() },
      );
    }
  }, [active]);

  const savePress = usePressScale<HTMLButtonElement>(0.97);
  const deletePress = usePressScale<HTMLButtonElement>(0.97);

  async function handleSave() {
    const amountCents = parseCents(amountStr);
    if (amountCents <= 0) { setError("please enter an amount."); return; }
    if (!categoryId || !subcategoryId) { setError("please select a category."); return; }

    setSaving(true);
    setError("");

    const body = {
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: amountCents,
      note: note.trim() || null,
      frequency,
      day_of_month: frequency === "monthly" ? dayOfMonth : null,
      start_date: frequency === "yearly" ? startDate : null,
      active: active ? 1 : 0,
    };

    try {
      let res: Response;
      if (isEdit && id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res = await api.api.recurring[":id"].$patch({ param: { id }, json: body } as any);
      } else {
        res = await api.api.recurring.$post({ json: body });
      }

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "failed to save.");
        setSaving(false);
        return;
      }

      const template = await res.json() as RecurringTemplate;
      await db.recurring_templates.put(template);

      route("/recurring");
    } catch {
      setError("network error. please try again.");
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!isEdit || !id) return;
    try {
      await api.api.recurring[":id"].$delete({ param: { id } });
      await db.recurring_templates.delete(id);
      route("/recurring");
    } catch {
      setError("failed to delete.");
      setConfirmingDelete(false);
    }
  }

  if (!loaded) {
    return (
      <div class="flex flex-1 items-center justify-center px-4">
        <p class="text-text-secondary text-sm">loading...</p>
      </div>
    );
  }

  const frequencies: Frequency[] = ["monthly", "weekly", "yearly"];

  return (
    <div class="flex flex-col gap-4 px-4 pt-2 safe-pb-lg">
      {/* Amount — same as the Add screen */}
      <AmountInput value={amountStr} onChange={setAmountStr} />

      {/* Category selector — full (non-compact) mode, matches Add screen:
          multi-sub categories zoom into subcategory pills; single-sub
          categories stay on the grid and just highlight the card. */}
      <CategorySelector
        categories={categories}
        subcategories={subcategories}
        initialCategoryId={categoryId || undefined}
        confirmedSubcategoryId={subcategoryId || undefined}
        onSelect={(catId, subId) => {
          setCategoryId(catId);
          setSubcategoryId(subId);
        }}
      />

      {/* Note */}
      <input
        type="text"
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        placeholder="note (optional)"
        class="w-full rounded-xl px-4 py-3 text-sm text-text-primary bg-bg-surface border border-text-ghost/20 outline-none placeholder:text-text-tertiary"
      />

      {/* ── Schedule card ──────────────────────────────────────────────────── */}
      <div
        class="rounded-2xl border"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "color-mix(in srgb, var(--color-text-ghost) 20%, transparent)",
        }}
      >
        {/* frequency row */}
        <div class="flex items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "color-mix(in srgb, var(--color-text-ghost) 12%, transparent)" }}>
          <span class="text-sm text-text-secondary">frequency</span>
          <div class="flex gap-1 rounded-full p-0.5" style={{ backgroundColor: "var(--color-bg-primary)" }}>
            {frequencies.map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                class="rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer border-0 transition-colors"
                style={{
                  backgroundColor: frequency === f ? "var(--color-accent)" : "transparent",
                  color: frequency === f ? "white" : "var(--color-text-secondary)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* day of month — only monthly */}
        {frequency === "monthly" && (
          <div class="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: "color-mix(in srgb, var(--color-text-ghost) 12%, transparent)" }}>
            <span class="text-sm text-text-secondary">day of month</span>
            <input
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onInput={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value, 10);
                if (!isNaN(v)) setDayOfMonth(Math.min(28, Math.max(1, v)));
              }}
              class="w-16 rounded-lg px-2 py-1.5 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none text-center tabular-nums [color-scheme:dark] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        )}

        {/* start date — only yearly */}
        {frequency === "yearly" && (
          <div class="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: "color-mix(in srgb, var(--color-text-ghost) 12%, transparent)" }}>
            <span class="text-sm text-text-secondary">start date</span>
            <input
              type="date"
              value={startDate}
              onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
              class="rounded-lg px-2 py-1.5 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none [color-scheme:dark]"
            />
          </div>
        )}

        {/* active row */}
        <div class="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: "color-mix(in srgb, var(--color-text-ghost) 12%, transparent)" }}>
          <span class="text-sm text-text-secondary">active</span>
          <button
            ref={trackRef}
            onClick={() => setActive(!active)}
            class="relative rounded-full cursor-pointer border-0 p-0"
            style={{
              width: 40,
              height: 24,
              backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
            }}
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
        </div>
      </div>

      {/* Error */}
      {error && (
        <p class="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>
      )}

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      {confirmingDelete ? (
        <ConfirmDialog
          message="delete this recurring expense?"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : (
        <div class={`grid ${isEdit ? "grid-cols-2" : "grid-cols-1"} gap-3 pt-1`}>
          <button
            ref={savePress.ref}
            onPointerDown={savePress.onPointerDown}
            onPointerUp={savePress.onPointerUp}
            onPointerCancel={savePress.onPointerCancel}
            onClick={handleSave}
            disabled={saving}
            class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: "var(--color-accent)",
              opacity: saving ? 0.6 : 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {saving ? "saving..." : "save"}
          </button>
          {isEdit && (
            <button
              ref={deletePress.ref}
              onPointerDown={deletePress.onPointerDown}
              onPointerUp={deletePress.onPointerUp}
              onPointerCancel={deletePress.onPointerCancel}
              onClick={() => setConfirmingDelete(true)}
              class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
              style={{
                height: 48,
                borderRadius: 14,
                backgroundColor: "rgba(255,55,95,0.12)",
                color: "var(--color-danger)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
