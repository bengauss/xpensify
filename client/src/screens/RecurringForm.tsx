import { useState, useEffect, useRef } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { db } from "@/db/local";
import type { RecurringTemplate } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Frequency = "monthly" | "weekly" | "yearly";

// ── Main component ────────────────────────────────────────────────────────────

export default function RecurringForm() {
  const { route } = useLocation();
  const routeMatch = useRoute();
  const id: string | undefined = (routeMatch.params as Record<string, string>)["id"];
  const isEdit = !!id;

  // Form state
  const [amountStr, setAmountStr] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!isEdit);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Spring toggle ref
  const knobRef = useRef<HTMLDivElement>(null);

  const categories = useLiveQuery(() => db.categories.toArray().then((cats) => cats.sort((a, b) => a.sort_order - b.sort_order)), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);

  // Load template data for edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    db.recurring_templates.get(id).then((t: RecurringTemplate | undefined) => {
      if (!t) { route("/recurring"); return; }
      setAmountCents(t.amount);
      setAmountStr((t.amount / 100).toFixed(2));
      setCategoryId(t.category_id);
      setSubcategoryId(t.subcategory_id);
      setNote(t.note ?? "");
      setFrequency(t.frequency);
      setDayOfMonth(t.day_of_month ?? 1);
      setActive(t.active === 1);
      setLoaded(true);
    });
  }, [id, isEdit]);

  // Spring toggle ref for the track
  const trackRef = useRef<HTMLButtonElement>(null);

  // Spring animation for the toggle knob + track
  useEffect(() => {
    if (!knobRef.current) return;
    animate(knobRef.current, { x: active ? 18 : 0 }, springs.toggle);
    if (trackRef.current) {
      animate(
        trackRef.current,
        { backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)" },
        springs.toggle
      );
    }
  }, [active]);

  async function handleSave() {
    if (amountCents <= 0) { setError("Please enter an amount."); return; }
    if (!categoryId || !subcategoryId) { setError("Please select a category."); return; }

    setSaving(true);
    setError("");

    const body = {
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: amountCents,
      note: note.trim() || null,
      frequency,
      day_of_month: frequency === "monthly" ? dayOfMonth : null,
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
        setError(data.error ?? "Failed to save.");
        setSaving(false);
        return;
      }

      const template = await res.json() as RecurringTemplate;

      // Update local DB
      await db.recurring_templates.put(template);

      route("/recurring");
    } catch {
      setError("Network error. Please try again.");
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
      setError("Failed to delete.");
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
    <div class="flex flex-col gap-5 px-4 pb-28 pt-2">
      <h2 class="text-lg font-semibold text-text-primary">
        {isEdit ? "Edit recurring expense" : "New recurring expense"}
      </h2>

      {/* Amount */}
      <AmountInput
        value={amountStr}
        onAmountChange={(cents) => {
          setAmountCents(cents);
          setAmountStr(cents > 0 ? (cents / 100).toFixed(2) : "");
        }}
      />

      {/* Category selector */}
      {categories && subcategories ? (
        <CategorySelector
          categories={categories}
          subcategories={subcategories}
          compact={true}
          initialCategoryId={categoryId || undefined}
          onSelect={(catId, subId) => {
            setCategoryId(catId);
            setSubcategoryId(subId);
          }}
        />
      ) : (
        <div class="h-32 rounded-xl bg-bg-surface animate-pulse" />
      )}

      {/* Note */}
      <input
        type="text"
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        placeholder="Note (optional)"
        class="w-full rounded-xl px-4 py-3 text-sm text-text-primary bg-bg-surface border border-text-ghost/20 outline-none placeholder:text-text-tertiary"
      />

      {/* Frequency pills */}
      <div class="flex flex-col gap-2">
        <label class="text-xs text-text-secondary font-medium uppercase tracking-wide">
          Frequency
        </label>
        <div class="flex gap-2">
          {frequencies.map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              class="flex-1 rounded-xl py-2.5 text-sm font-medium cursor-pointer border-0"
              style={{
                backgroundColor:
                  frequency === f
                    ? "var(--color-accent)"
                    : "var(--color-bg-surface)",
                color:
                  frequency === f
                    ? "white"
                    : "var(--color-text-secondary)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Day of month — only for monthly */}
      {frequency === "monthly" && (
        <div class="flex flex-col gap-2">
          <label class="text-xs text-text-secondary font-medium uppercase tracking-wide">
            Day of month
          </label>
          <input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onInput={(e) => {
              const v = parseInt((e.target as HTMLInputElement).value, 10);
              if (!isNaN(v)) setDayOfMonth(Math.min(28, Math.max(1, v)));
            }}
            class="w-full rounded-xl px-4 py-3 text-sm text-text-primary bg-bg-surface border border-text-ghost/20 outline-none [color-scheme:dark]"
          />
        </div>
      )}

      {/* Active toggle */}
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-body">Active</span>
        <button
          ref={trackRef}
          onClick={() => setActive(!active)}
          class="relative rounded-full cursor-pointer border-0 p-0"
          style={{
            width: 44,
            height: 26,
            backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
          }}
        >
          <div
            ref={knobRef}
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "white",
            }}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <p class="text-sm text-danger">{error}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        class="w-full rounded-xl py-3 text-sm font-semibold text-white cursor-pointer border-0"
        style={{ backgroundColor: "var(--color-accent)", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "saving..." : isEdit ? "save changes" : "add recurring expense"}
      </button>

      {/* Delete (edit mode only) */}
      {isEdit && (
        showDeleteConfirm ? (
          <ConfirmDialog
            message="Delete this recurring expense?"
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            class="w-full rounded-xl py-3 text-sm font-medium cursor-pointer border-0 bg-transparent"
            style={{ color: "var(--color-danger)" }}
          >
            delete
          </button>
        )
      )}

      {/* Cancel */}
      <button
        onClick={() => route("/recurring")}
        class="w-full text-center text-sm text-text-secondary cursor-pointer border-0 bg-transparent py-2"
      >
        cancel
      </button>
    </div>
  );
}
