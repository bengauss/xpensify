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
  auto_saved_count: number;
}

interface AliasRow {
  alias_normalized: string;
  canonical_normalized: string;
  created_at: string;
}

function AppleLogo({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.72 6.4c-1.45 0-2.46.65-3.36.65-.9 0-1.86-.62-3.16-.62-1.7 0-3.34.97-4.27 2.55-1.83 3.18-.47 7.86 1.31 10.43.86 1.26 1.9 2.66 3.27 2.66 1.32 0 1.79-.83 3.34-.83 1.55 0 1.97.83 3.32.83 1.39 0 2.27-1.27 3.13-2.55a11.27 11.27 0 0 0 1.42-2.93c-.04-.02-2.73-1.06-2.73-4.16 0-2.69 2.16-3.97 2.26-4.04-1.24-1.83-3.13-2.04-3.78-2.04-1.7 0-3.07.95-3.83.95Z" />
      <path d="M14.93 4.4c.69-.83 1.16-1.96 1.04-3.1-.99.05-2.16.65-2.85 1.48-.62.74-1.18 1.92-1.04 3.05 1.07.08 2.16-.55 2.85-1.43Z" />
    </svg>
  );
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function MergePicker({
  source,
  candidates,
  onCancel,
  onMerge,
}: {
  source: MerchantRow;
  candidates: MerchantRow[];
  onCancel: () => void;
  onMerge: (target: MerchantRow) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [merging, setMerging] = useState(false);
  const cancelPress = usePressScale<HTMLButtonElement>(0.95);
  const filtered = query.trim()
    ? candidates.filter((c) =>
        c.merchant_normalized.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : candidates;

  return (
    <div class="flex flex-col gap-3">
      <div>
        <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          merge "{source.merchant_normalized}" into…
        </h2>
        <p class="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
          future apple pay hits as "{source.merchant_normalized}" will be saved
          under the target merchant's category. existing apple pay history with
          this name will be relabeled, unless you've edited the note.
        </p>
      </div>

      <input
        type="text"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        placeholder="search merchants"
        class="w-full text-sm bg-transparent border-0 outline-none"
        style={{
          height: 44,
          paddingLeft: 14,
          paddingRight: 14,
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.06)",
          color: "var(--color-text-primary)",
        }}
      />

      <div
        class="flex flex-col"
        style={{ maxHeight: 320, overflowY: "auto" }}
      >
        {filtered.length === 0 ? (
          <p
            class="text-sm text-center py-6"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            no other merchants match
          </p>
        ) : (
          filtered.map((m) => {
            const Icon = m.category_icon ? categoryIcons[m.category_icon] : null;
            const color = m.category_color ?? "#868e96";
            return (
              <button
                key={m.merchant_normalized}
                disabled={merging}
                onClick={async () => {
                  setMerging(true);
                  try {
                    await onMerge(m);
                  } finally {
                    setMerging(false);
                  }
                }}
                class="w-full text-left flex items-center gap-3 px-1 py-2.5 cursor-pointer bg-transparent border-0"
                style={{
                  WebkitTapHighlightColor: "transparent",
                  opacity: merging ? 0.5 : 1,
                }}
              >
                <div
                  class="flex-shrink-0 flex items-center justify-center rounded-xl"
                  style={{ width: 32, height: 32, backgroundColor: `${color}1a` }}
                >
                  {Icon && <Icon color={color} size={18} />}
                </div>
                <div class="flex-1 min-w-0">
                  <p
                    class="text-base truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {m.merchant_normalized}
                  </p>
                  <p
                    class="text-xs truncate"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {m.category_name ?? "—"} · {m.subcategory_name ?? "—"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <button
        ref={cancelPress.ref}
        onPointerDown={cancelPress.onPointerDown}
        onPointerUp={cancelPress.onPointerUp}
        onPointerCancel={cancelPress.onPointerCancel}
        onClick={onCancel}
        disabled={merging}
        class="flex items-center justify-center text-sm font-medium cursor-pointer border-0 bg-transparent"
        style={{
          height: 44,
          color: "var(--color-text-secondary)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        cancel
      </button>
    </div>
  );
}

function MerchantEditor({
  merchant,
  candidates,
  onClose,
  onChanged,
}: {
  merchant: MerchantRow;
  candidates: MerchantRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [catId, setCatId] = useState(merchant.category_id);
  const [subId, setSubId] = useState(merchant.subcategory_id);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const savePress = usePressScale<HTMLButtonElement>(0.97);
  const deletePress = usePressScale<HTMLButtonElement>(0.97);
  const mergePress = usePressScale<HTMLButtonElement>(0.97);

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

  async function handleMerge(target: MerchantRow) {
    const res = await (api.api.merchants[":merchant"].merge.$post as any)({
      param: { merchant: encodeURIComponent(merchant.merchant_normalized) },
      json: { into: target.merchant_normalized },
    });
    if (res.ok) {
      onChanged();
      onClose();
    }
  }

  if (mergeMode) {
    return (
      <MergePicker
        source={merchant}
        candidates={candidates}
        onCancel={() => setMergeMode(false)}
        onMerge={handleMerge}
      />
    );
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
        <div class="flex flex-col" style={{ gap: 10 }}>
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
          {candidates.length > 0 && (
            <button
              ref={mergePress.ref}
              onPointerDown={mergePress.onPointerDown}
              onPointerUp={mergePress.onPointerUp}
              onPointerCancel={mergePress.onPointerCancel}
              onClick={() => setMergeMode(true)}
              class="flex items-center justify-center text-sm font-medium cursor-pointer border-0"
              style={{
                height: 44,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "var(--color-text-primary)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              merge into another merchant…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MerchantSection({
  title,
  hint,
  count,
  rows,
  onSelect,
  variant,
}: {
  title: string;
  hint: string;
  count: number;
  rows: MerchantRow[];
  onSelect: (m: MerchantRow) => void;
  variant: "auto" | "learning";
}) {
  return (
    <div>
      <div class="flex items-baseline justify-between px-1 pb-1.5">
        <span class="text-xs font-semibold lowercase" style={{ color: "var(--color-text-tertiary)" }}>
          {title} · {count}
        </span>
      </div>
      <p class="text-xs px-1 pb-2" style={{ color: "var(--color-text-tertiary)" }}>
        {hint}
      </p>
      <div class="flex flex-col">
        {rows.map((m) => {
          const Icon = m.category_icon ? categoryIcons[m.category_icon] : null;
          const color = m.category_color ?? "#868e96";
          return (
            <button
              key={m.merchant_normalized}
              onClick={() => onSelect(m)}
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
              {variant === "auto" ? (
                <span
                  class="flex-shrink-0 inline-flex items-center gap-1 text-xs tabular-nums"
                  style={{ color: "var(--color-text-tertiary)" }}
                  title={`auto-saved ${m.auto_saved_count} ${m.auto_saved_count === 1 ? "time" : "times"}`}
                >
                  <AppleLogo />
                  {m.auto_saved_count}
                </span>
              ) : (
                <span
                  class="flex-shrink-0 text-xs tabular-nums px-2 py-0.5 rounded-full"
                  style={{
                    color: "#ff9f0a",
                    backgroundColor: "rgba(255,159,10,0.12)",
                  }}
                  title="needs one more confirmation"
                >
                  1/2
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsMerchantsScreen() {
  const { route } = useLocation();
  const [rows, setRows] = useState<MerchantRow[] | null>(null);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [selected, setSelected] = useState<MerchantRow | null>(null);
  const backPress = usePressScale<HTMLButtonElement>(0.95);

  async function load() {
    try {
      const [rowsRes, aliasesRes] = await Promise.all([
        api.api.merchants.$get(),
        (api.api.merchants.aliases.$get as any)(),
      ]);
      if (rowsRes.ok) {
        const data = (await rowsRes.json()) as MerchantRow[];
        setRows(data);
      }
      if (aliasesRes.ok) {
        const data = (await aliasesRes.json()) as AliasRow[];
        setAliases(data);
      }
    } catch {
      setRows([]);
      setAliases([]);
    }
  }

  async function handleUnmerge(alias: string) {
    const res = await (api.api.merchants.aliases[":alias"].$delete as any)({
      param: { alias: encodeURIComponent(alias) },
    });
    if (res.ok) load();
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

      {rows && rows.length > 0 && (() => {
        const autoLogging = rows.filter((m) => m.confirmation_count >= 2);
        const learning = rows.filter((m) => m.confirmation_count < 2);
        return (
          <div class="flex flex-col gap-5">
            {autoLogging.length > 0 && (
              <MerchantSection
                title="auto-logging"
                hint="confirmed ≥ 2× — next transaction saves without asking"
                count={autoLogging.length}
                rows={autoLogging}
                onSelect={setSelected}
                variant="auto"
              />
            )}
            {learning.length > 0 && (
              <MerchantSection
                title="learning"
                hint="confirmed once — next transaction will be pending again"
                count={learning.length}
                rows={learning}
                onSelect={setSelected}
                variant="learning"
              />
            )}
            {aliases.length > 0 && (
              <div>
                <div class="flex items-baseline justify-between px-1 pb-1.5">
                  <span class="text-xs font-semibold lowercase" style={{ color: "var(--color-text-tertiary)" }}>
                    merged · {aliases.length}
                  </span>
                </div>
                <p class="text-xs px-1 pb-2" style={{ color: "var(--color-text-tertiary)" }}>
                  alternate names that resolve to a canonical merchant. tap to un-merge.
                </p>
                <div class="flex flex-col">
                  {aliases.map((a) => (
                    <button
                      key={a.alias_normalized}
                      onClick={() => handleUnmerge(a.alias_normalized)}
                      class="w-full text-left flex items-center gap-3 px-1 py-2.5 cursor-pointer bg-transparent border-0"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <div class="flex-1 min-w-0">
                        <p class="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
                          {a.alias_normalized}
                        </p>
                        <p class="text-xs truncate" style={{ color: "var(--color-text-tertiary)" }}>
                          → {a.canonical_normalized}
                        </p>
                      </div>
                      <span
                        class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full"
                        style={{
                          color: "var(--color-text-secondary)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                        }}
                      >
                        un-merge
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <DetailSheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <MerchantEditor
            merchant={selected}
            candidates={(rows ?? []).filter(
              (r) => r.merchant_normalized !== selected.merchant_normalized,
            )}
            onClose={() => setSelected(null)}
            onChanged={load}
          />
        )}
      </DetailSheet>
    </div>
  );
}
