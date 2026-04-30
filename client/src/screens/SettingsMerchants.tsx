import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { api } from "@/lib/api";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";
import { CategorySelector } from "@/components/CategorySelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DetailSheet } from "@/components/DetailSheet";
import { categoryIcons } from "@/icons";
import { MONTHS_SHORT } from "@/lib/format";
import { usePressScale } from "@/lib/usePressScale";

interface MerchantRow {
  merchant_normalized: string;
  category_id: string;
  subcategory_id: string;
  confirmation_count: number;
  last_confirmed_at: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  subcategory_name: string | null;
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function MerchantEditor({
  merchant,
  onClose,
  onChanged,
}: {
  merchant: MerchantRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [catId, setCatId] = useState(merchant.category_id);
  const [subId, setSubId] = useState(merchant.subcategory_id);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savePress = usePressScale<HTMLButtonElement>(0.97);
  const deletePress = usePressScale<HTMLButtonElement>(0.97);

  async function handleSave() {
    if (!catId || !subId) return;
    if (catId === merchant.category_id && subId === merchant.subcategory_id) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await (api.api.merchants[":merchant"].$patch as any)({
        param: { merchant: encodeURIComponent(merchant.merchant_normalized) },
        json: { category_id: catId, subcategory_id: subId },
      });
      if (res.ok) {
        onChanged();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await (api.api.merchants[":merchant"].$delete as any)({
        param: { merchant: encodeURIComponent(merchant.merchant_normalized) },
      });
      if (res.ok) {
        onChanged();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div>
        <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {merchant.merchant_normalized}
        </h2>
        <p class="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
          changing the category resets the confirmation count to 1, so the next
          transaction at this merchant will be pending instead of auto-saving.
        </p>
      </div>

      <CategorySelector
        compact
        categories={CATEGORIES}
        subcategories={SUBCATEGORIES}
        initialCategoryId={catId}
        confirmedSubcategoryId={subId}
        onSelect={(c, s) => {
          setCatId(c);
          setSubId(s);
        }}
      />

      <div
        class="rounded-xl"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <div
          class="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>confirmations</span>
          <span class="text-sm tabular-nums" style={{ color: "var(--color-text-primary)" }}>
            {merchant.confirmation_count}
          </span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>last confirmed</span>
          <span class="text-sm" style={{ color: "var(--color-text-primary)" }}>
            {formatFull(merchant.last_confirmed_at)}
          </span>
        </div>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          message="forget this merchant? next transaction will be pending with no suggestion."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : (
        <div class="grid grid-cols-2" style={{ gap: 10 }}>
          <button
            ref={savePress.ref}
            onPointerDown={savePress.onPointerDown}
            onPointerUp={savePress.onPointerUp}
            onPointerCancel={savePress.onPointerCancel}
            onClick={handleSave}
            disabled={saving || !catId || !subId}
            class="flex items-center justify-center text-sm font-medium text-white cursor-pointer border-0"
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: "var(--color-accent)",
              opacity: saving || !catId || !subId ? 0.5 : 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {saving ? "saving..." : "save changes"}
          </button>
          <button
            ref={deletePress.ref}
            onPointerDown={deletePress.onPointerDown}
            onPointerUp={deletePress.onPointerUp}
            onPointerCancel={deletePress.onPointerCancel}
            onClick={() => setConfirmDelete(true)}
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
        </div>
      )}
    </div>
  );
}

export default function SettingsMerchantsScreen() {
  const { route } = useLocation();
  const [rows, setRows] = useState<MerchantRow[] | null>(null);
  const [selected, setSelected] = useState<MerchantRow | null>(null);
  const backPress = usePressScale<HTMLButtonElement>(0.95);

  async function load() {
    try {
      const res = await api.api.merchants.$get();
      if (!res.ok) return;
      const data = (await res.json()) as MerchantRow[];
      setRows(data);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div class="flex flex-col px-4 pt-2 safe-pb-lg">
      <div class="flex items-center gap-3 pb-3">
        <button
          ref={backPress.ref}
          onPointerDown={backPress.onPointerDown}
          onPointerUp={backPress.onPointerUp}
          onPointerCancel={backPress.onPointerCancel}
          onClick={() => route("/settings")}
          class="flex items-center justify-center bg-transparent border-0 cursor-pointer"
          style={{
            width: 32,
            height: 32,
            color: "var(--color-text-primary)",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label="back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 class="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          merchant memory
        </h1>
      </div>

      {rows === null && <div class="flex-1" />}

      {rows && rows.length === 0 && (
        <div class="flex flex-1 items-center justify-center py-16 text-center px-6">
          <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            no merchant mappings yet. apple pay transactions you confirm will
            be remembered here.
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div class="flex flex-col">
          {rows.map((m) => {
            const Icon = m.category_icon ? categoryIcons[m.category_icon] : null;
            const color = m.category_color ?? "#868e96";
            return (
              <button
                key={m.merchant_normalized}
                onClick={() => setSelected(m)}
                class="w-full text-left flex items-center gap-3 px-1 py-2.5 cursor-pointer bg-transparent border-0"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  class="flex-shrink-0 flex items-center justify-center rounded-xl"
                  style={{ width: 36, height: 36, backgroundColor: `${color}1a` }}
                >
                  {Icon && <Icon color={color} size={20} />}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-base truncate" style={{ color: "var(--color-text-primary)" }}>
                    {m.merchant_normalized}
                  </p>
                  <p class="text-sm truncate" style={{ color: "var(--color-text-secondary)" }}>
                    {m.category_name ?? "—"} · {m.subcategory_name ?? "—"}
                  </p>
                </div>
                <span
                  class="flex-shrink-0 text-xs tabular-nums"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {m.confirmation_count} {m.confirmation_count === 1 ? "confirmation" : "confirmations"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <DetailSheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <MerchantEditor
            merchant={selected}
            onClose={() => setSelected(null)}
            onChanged={load}
          />
        )}
      </DetailSheet>
    </div>
  );
}
