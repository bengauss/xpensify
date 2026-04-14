import { useState, useEffect, useRef } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { db } from "@/db/local";
import type { RecurringTemplate } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput, parseCents, formatCentsDE } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { categoryIcons } from "@/icons";
import { api } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Frequency = "monthly" | "weekly" | "yearly";

// ── Main component ────────────────────────────────────────────────────────────

export default function RecurringForm({ id: idProp }: { id?: string } = {}) {
  const { route } = useLocation();
  const routeMatch = useRoute();
  const id: string | undefined =
    idProp ?? (routeMatch.params as Record<string, string>)["id"];
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
  // Identity card is collapsed by default in edit mode, expanded for new
  const [identityOpen, setIdentityOpen] = useState(!isEdit);

  const categories = useLiveQuery(
    () => db.categories.toArray().then((cats) => cats.sort((a, b) => a.sort_order - b.sort_order)),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);

  // Load template data for edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    db.recurring_templates.get(id).then((t: RecurringTemplate | undefined) => {
      if (!t) { route("/recurring"); return; }
      setAmountStr(formatCentsDE(t.amount));
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
    animate(knobRef.current, { x: active ? 16 : 0 }, springs.toggle);
    if (trackRef.current) {
      animate(
        trackRef.current,
        { backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)" },
        springs.toggle
      );
    }
  }, [active]);

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
  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedSubcategory = subcategories?.find((s) => s.id === subcategoryId);
  const IdentityIcon = selectedCategory ? categoryIcons[selectedCategory.icon] : null;
  const identityColor = selectedCategory?.color ?? "var(--color-accent)";
  const identityAmount = amountStr || "0,00";

  return (
    <div class="flex flex-col gap-4 px-4 pt-2 safe-pb-lg">
      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <div
        class="rounded-2xl border"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "color-mix(in srgb, var(--color-text-ghost) 20%, transparent)",
        }}
      >
        {/* Collapsed summary row — clickable in edit mode */}
        <button
          onClick={() => isEdit && setIdentityOpen((v) => !v)}
          disabled={!isEdit}
          class="flex items-center gap-3 w-full text-left px-4 py-3 cursor-pointer bg-transparent border-0"
          style={{ cursor: isEdit ? "pointer" : "default" }}
        >
          <div
            class="flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, backgroundColor: `${identityColor}1a` }}
          >
            {IdentityIcon && <IdentityIcon color={identityColor} size={20} />}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text-primary truncate">
              {selectedCategory && selectedSubcategory
                ? `${selectedCategory.name} · ${selectedSubcategory.name}`
                : "select a category"}
            </p>
            {note.trim() && (
              <p class="text-xs text-text-secondary truncate">{note.trim()}</p>
            )}
          </div>
          <span class="text-base font-medium tabular-nums text-text-primary">
            {identityAmount}
          </span>
        </button>

        {/* Expanded editor */}
        {identityOpen && (
          <div class="flex flex-col gap-4 px-4 pb-4 pt-1 border-t" style={{ borderColor: "color-mix(in srgb, var(--color-text-ghost) 12%, transparent)" }}>
            <AmountInput value={amountStr} onChange={setAmountStr} />
            {categories && subcategories ? (
              <CategorySelector
                categories={categories}
                subcategories={subcategories}
                compact
                initialCategoryId={categoryId || undefined}
                confirmedSubcategoryId={subcategoryId || undefined}
                onSelect={(catId, subId) => {
                  setCategoryId(catId);
                  setSubcategoryId(subId);
                }}
              />
            ) : (
              <div class="h-32 rounded-xl bg-bg-surface animate-pulse" />
            )}
            <input
              type="text"
              value={note}
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
              placeholder="note (optional)"
              class="w-full rounded-xl px-4 py-3 text-sm text-text-primary bg-bg-primary border border-text-ghost/20 outline-none placeholder:text-text-tertiary"
            />
          </div>
        )}
      </div>

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
            onClick={handleSave}
            disabled={saving}
            class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: "var(--color-accent)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "saving..." : "save"}
          </button>
          {isEdit && (
            <button
              onClick={() => setConfirmingDelete(true)}
              class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
              style={{
                height: 48,
                borderRadius: 14,
                backgroundColor: "rgba(255,55,95,0.12)",
                color: "var(--color-danger)",
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
