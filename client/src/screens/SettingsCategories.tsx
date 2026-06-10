import { useState, useRef, useLayoutEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { db } from "@/db/local";
import type { Category, Subcategory } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { categoryIcons } from "@/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { usePressScale } from "@/lib/usePressScale";
import { shouldReduceMotion } from "@/lib/animations";

function CategoryRow({
  category,
  isFirst,
  isLast,
  expanded,
  onToggle,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: (newName: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(category.name);

  const IconComponent = categoryIcons[category.icon] ?? categoryIcons["other"];
  const upPress = usePressScale<HTMLButtonElement>(0.92);
  const downPress = usePressScale<HTMLButtonElement>(0.92);
  const editPress = usePressScale<HTMLButtonElement>(0.92);
  const deletePress = usePressScale<HTMLButtonElement>(0.92);

  function commitEdit() {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== category.name) onEdit(trimmed);
    setEditing(false);
  }

  return (
    <div class="flex items-center gap-3 py-2.5">
      {editing ? (
        <>
          <span class="shrink-0" style={{ color: category.color }}>
            <IconComponent color={category.color} size={20} />
          </span>
          <input
            class="flex-1 rounded-lg bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none border border-accent/40"
            value={editVal}
            onInput={(e) => setEditVal((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") { setEditVal(category.name); setEditing(false); }
            }}
            onBlur={commitEdit}
            autoFocus
          />
        </>
      ) : (
        <button
          onClick={onToggle}
          class="flex flex-1 min-w-0 items-center gap-3 bg-transparent border-0 p-0 cursor-pointer text-left"
          style={{ WebkitTapHighlightColor: "transparent" }}
          aria-expanded={expanded}
        >
          <span class="shrink-0" style={{ color: category.color }}>
            <IconComponent color={category.color} size={20} />
          </span>
          <span class="flex-1 text-sm text-text-primary">{category.name}</span>
          <span class="shrink-0 text-text-ghost text-xs leading-none" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}>▸</span>
        </button>
      )}

      <button ref={upPress.ref} onPointerDown={upPress.onPointerDown} onPointerUp={upPress.onPointerUp} onPointerCancel={upPress.onPointerCancel} onClick={onMoveUp} disabled={isFirst} class="text-text-secondary hover:text-text-primary disabled:opacity-20 p-1.5 text-base leading-none" title="move up" style={{ WebkitTapHighlightColor: "transparent" }}>↑</button>
      <button ref={downPress.ref} onPointerDown={downPress.onPointerDown} onPointerUp={downPress.onPointerUp} onPointerCancel={downPress.onPointerCancel} onClick={onMoveDown} disabled={isLast} class="text-text-secondary hover:text-text-primary disabled:opacity-20 p-1.5 text-base leading-none" title="move down" style={{ WebkitTapHighlightColor: "transparent" }}>↓</button>
      <button ref={editPress.ref} onPointerDown={editPress.onPointerDown} onPointerUp={editPress.onPointerUp} onPointerCancel={editPress.onPointerCancel} onClick={() => { setEditVal(category.name); setEditing(true); }} class="text-text-secondary hover:text-accent p-1.5" title="edit" style={{ WebkitTapHighlightColor: "transparent" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button ref={deletePress.ref} onPointerDown={deletePress.onPointerDown} onPointerUp={deletePress.onPointerUp} onPointerCancel={deletePress.onPointerCancel} onClick={onDelete} class="text-text-secondary hover:text-red-400 p-1.5" title="delete" style={{ WebkitTapHighlightColor: "transparent" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function SubcategoryRow({
  subcategory,
  onRename,
  onDelete,
}: {
  subcategory: Subcategory;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(subcategory.name);
  const editPress = usePressScale<HTMLButtonElement>(0.92);
  const deletePress = usePressScale<HTMLButtonElement>(0.92);

  function commitEdit() {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== subcategory.name) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div class="flex items-center gap-2 py-2">
      {editing ? (
        <input
          class="flex-1 rounded-lg bg-bg-primary px-3 py-1.5 text-sm text-text-primary outline-none border border-accent/40"
          value={editVal}
          onInput={(e) => setEditVal((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") { setEditVal(subcategory.name); setEditing(false); }
          }}
          onBlur={commitEdit}
          autoFocus
        />
      ) : (
        <span class="flex-1 text-sm text-text-secondary">{subcategory.name}</span>
      )}

      <button ref={editPress.ref} onPointerDown={editPress.onPointerDown} onPointerUp={editPress.onPointerUp} onPointerCancel={editPress.onPointerCancel} onClick={() => { setEditVal(subcategory.name); setEditing(true); }} class="text-text-ghost hover:text-accent p-1.5" title="rename subcategory" style={{ WebkitTapHighlightColor: "transparent" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button ref={deletePress.ref} onPointerDown={deletePress.onPointerDown} onPointerUp={deletePress.onPointerUp} onPointerCancel={deletePress.onPointerCancel} onClick={onDelete} class="text-text-ghost hover:text-red-400 p-1.5" title="delete subcategory" style={{ WebkitTapHighlightColor: "transparent" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function SubcategoryDrawer({
  category,
  setError,
}: {
  category: Category;
  setError: (msg: string) => void;
}) {
  const subcategories = useLiveQuery(
    () =>
      db.subcategories
        .where("category_id")
        .equals(category.id)
        .toArray()
        .then((subs) => subs.sort((a, b) => a.sort_order - b.sort_order)),
    [category.id]
  );

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [deletingSub, setDeletingSub] = useState<{ id: string; name: string } | null>(null);

  // Measure-before-commit height reveal (CLAUDE.md height-animation gotcha):
  // measure the natural height in a layout effect — before the browser paints —
  // then animate from 0 so the drawer grows in instead of popping. Runs once,
  // after the first subcategory query resolves so the measurement is accurate.
  const drawerRef = useRef<HTMLDivElement>(null);
  const animated = useRef(false);
  useLayoutEffect(() => {
    if (subcategories === undefined || animated.current) return;
    animated.current = true;
    const el = drawerRef.current;
    if (!el || shouldReduceMotion()) return;
    const target = el.scrollHeight;
    el.style.overflow = "hidden";
    el.style.height = "0px";
    void el.offsetHeight; // force reflow so 0px is the transition's start value
    el.style.transition = "height 200ms ease";
    el.style.height = `${target}px`;
    el.addEventListener(
      "transitionend",
      () => {
        el.style.height = "auto";
        el.style.overflow = "";
        el.style.transition = "";
      },
      { once: true }
    );
  }, [subcategories === undefined]);

  async function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await api.api.categories[":id"].subcategories.$post({ param: { id: category.id }, json: { name } } as any);
    if (!res.ok) { setError("Failed to add subcategory"); return; }
    const created = await res.json() as unknown as Subcategory;
    await db.subcategories.put(created);
    setAddName("");
    setAdding(false);
  }

  async function handleRename(id: string, newName: string) {
    setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (api.api.categories as any).subcategories[":id"].$patch({ param: { id }, json: { name: newName } } as any);
    if (!res.ok) { setError("Failed to rename subcategory"); return; }
    const updated = await res.json() as unknown as Subcategory;
    await db.subcategories.put(updated);
  }

  async function handleDeleteConfirmed(id: string) {
    setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (api.api.categories as any).subcategories[":id"].$delete({ param: { id } } as any);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Failed to delete subcategory");
      setDeletingSub(null);
      return;
    }
    await db.subcategories.delete(id);
    setDeletingSub(null);
  }

  return (
    <div ref={drawerRef} class="pl-9 pr-1 pb-2">
      {(subcategories ?? []).map((sub) => (
        <SubcategoryRow
          key={sub.id}
          subcategory={sub}
          onRename={(newName) => handleRename(sub.id, newName)}
          onDelete={() => setDeletingSub({ id: sub.id, name: sub.name })}
        />
      ))}

      {adding ? (
        <div class="flex items-center gap-2 py-2">
          <input
            class="flex-1 rounded bg-bg-primary px-2 py-1.5 text-sm text-text-primary outline-none border border-accent/40"
            placeholder="subcategory name"
            value={addName}
            onInput={(e) => setAddName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); } }}
            autoFocus
          />
          <button onClick={handleAdd} class="text-xs text-accent px-2 py-1.5 bg-transparent border-0 cursor-pointer">save</button>
          <button onClick={() => { setAdding(false); setAddName(""); }} class="text-xs text-text-ghost px-2 py-1.5 bg-transparent border-0 cursor-pointer">cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} class="text-xs text-accent py-2 bg-transparent border-0 cursor-pointer">+ subcategory</button>
      )}

      {deletingSub && (
        <ConfirmDialog
          message={`delete subcategory "${deletingSub.name}"? this cannot be undone.`}
          onConfirm={() => handleDeleteConfirmed(deletingSub.id)}
          onCancel={() => setDeletingSub(null)}
        />
      )}
    </div>
  );
}

export default function SettingsCategoriesScreen() {
  const { route } = useLocation();
  const categories = useLiveQuery(
    () => db.categories.toArray().then((cats) => cats.sort((a, b) => a.sort_order - b.sort_order)),
    []
  ) ?? [];

  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<{ id: string; name: string } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function patchCategory(id: string, body: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await api.api.categories[":id"].$patch({ param: { id }, json: body } as any);
    if (!res.ok) throw new Error("Failed to update category");
    const updated = await res.json() as unknown as Category;
    await db.categories.put(updated);
  }

  async function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const a = categories[idx];
    const b = categories[idx - 1];
    await patchCategory(a.id, { sort_order: b.sort_order });
    await patchCategory(b.id, { sort_order: a.sort_order });
  }

  async function handleMoveDown(idx: number) {
    if (idx === categories.length - 1) return;
    const a = categories[idx];
    const b = categories[idx + 1];
    await patchCategory(a.id, { sort_order: b.sort_order });
    await patchCategory(b.id, { sort_order: a.sort_order });
  }

  async function handleEdit(id: string, newName: string) {
    await patchCategory(id, { name: newName });
  }

  async function handleDeleteConfirmed(id: string) {
    const res = await api.api.categories[":id"].$delete({ param: { id } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Failed to delete category");
      setDeletingCategory(null);
      return;
    }
    await db.categories.delete(id);
    setDeletingCategory(null);
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await api.api.categories.$post({ json: { name } } as any);
    if (!res.ok) { setError("Failed to add category"); return; }
    const created = await res.json() as unknown as Category;
    await db.categories.put(created);
    setAddName("");
    setAdding(false);
  }

  return (
    <div class="flex flex-col gap-4 px-4 pt-2 safe-pb-lg">
      {/* Back header */}
      <div class="flex items-center justify-between pt-1">
        <button
          onClick={() => route("/settings")}
          class="flex items-center gap-1 text-sm text-text-secondary bg-transparent border-0 cursor-pointer p-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>settings</span>
        </button>
        <button
          onClick={() => setAdding(true)}
          class="text-sm text-accent bg-transparent border-0 cursor-pointer p-0"
        >
          add
        </button>
      </div>

      <h1 class="text-[17px] font-semibold text-text-primary">categories</h1>

      {error && <p class="text-xs text-red-400">{error}</p>}

      <section
        style={{
          backgroundColor: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
        }}
        class="px-4 divide-y divide-text-ghost/10"
      >
        {categories.map((cat, idx) => (
          <div key={cat.id}>
            <CategoryRow
              category={cat}
              isFirst={idx === 0}
              isLast={idx === categories.length - 1}
              expanded={expandedIds.has(cat.id)}
              onToggle={() => toggleExpand(cat.id)}
              onMoveUp={() => handleMoveUp(idx)}
              onMoveDown={() => handleMoveDown(idx)}
              onEdit={(newName) => handleEdit(cat.id, newName)}
              onDelete={() => setDeletingCategory({ id: cat.id, name: cat.name })}
            />
            {expandedIds.has(cat.id) && (
              <SubcategoryDrawer category={cat} setError={setError} />
            )}
          </div>
        ))}

        {adding && (
          <div class="flex items-center gap-2 py-3">
            <input
              class="flex-1 rounded bg-bg-primary px-2 py-1.5 text-sm text-text-primary outline-none border border-accent/40"
              placeholder="category name"
              value={addName}
              onInput={(e) => setAddName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
              autoFocus
            />
            <button onClick={handleAdd} class="text-xs text-accent px-2 py-1.5 bg-transparent border-0 cursor-pointer">save</button>
            <button onClick={() => { setAdding(false); setAddName(""); }} class="text-xs text-text-ghost px-2 py-1.5 bg-transparent border-0 cursor-pointer">cancel</button>
          </div>
        )}
      </section>

      {deletingCategory && (
        <ConfirmDialog
          message={`delete category "${deletingCategory.name}"? this cannot be undone.`}
          onConfirm={() => handleDeleteConfirmed(deletingCategory.id)}
          onCancel={() => setDeletingCategory(null)}
        />
      )}
    </div>
  );
}
