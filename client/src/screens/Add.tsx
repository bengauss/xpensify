import { useState, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { db } from "@/db/local";
import type { Expense } from "@/db/local";
import { useLiveQuery } from "@/lib/useLiveQuery";
import { AmountInput } from "@/components/AmountInput";
import { CategorySelector } from "@/components/CategorySelector";
import { NoteInput } from "@/components/NoteInput";
import { Toast } from "@/components/Toast";
import { currentUser } from "@/lib/auth";
import { sync } from "@/sync/engine";

/** Signal used by History detail sheet to put Add screen into edit mode */
export const editingExpense = signal<Expense | null>(null);

export function AddScreen() {
  const editing = editingExpense.value;

  const [amount, setAmount] = useState(editing ? (editing.amount / 100).toFixed(2) : "");
  const [amountCents, setAmountCents] = useState(editing?.amount ?? 0);
  const [note, setNote] = useState(editing?.note ?? "");
  const [showNote, setShowNote] = useState(!!editing?.note);
  const [dateStr, setDateStr] = useState(
    editing ? editing.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [showDate, setShowDate] = useState(!!editing);
  const [toast, setToast] = useState({ visible: false, message: "" });

  const amountRef = useRef<HTMLInputElement>(null);

  const categories = useLiveQuery(() =>
    db.categories.orderBy("sort_order").toArray()
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray());

  if (!categories || !subcategories) return null;

  const today = new Date();
  const dateLabel = formatDateLabel(dateStr, today);

  async function handleSelect(categoryId: string, subcategoryId: string) {
    if (amountCents <= 0) return;

    const now = new Date().toISOString();
    const cat = categories!.find((c) => c.id === categoryId);
    const sub = subcategories!.find((s) => s.id === subcategoryId);

    if (editing) {
      // Edit mode: update existing expense
      await db.expenses.update(editing.id, {
        amount: amountCents,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        note: note.trim() || null,
        timestamp: `${dateStr}T12:00:00.000Z`,
        updated_at: now,
        sync_status: "pending",
      });
      setToast({ visible: true, message: `✓ EUR ${(amountCents / 100).toFixed(2)} → ${sub?.name ?? "expense"} updated` });
      editingExpense.value = null;
    } else {
      // New expense
      await db.expenses.add({
        id: crypto.randomUUID(),
        user_id: currentUser.value?.id ?? "",
        category_id: categoryId,
        subcategory_id: subcategoryId,
        amount: amountCents,
        note: note.trim() || null,
        tags: null,
        timestamp: `${dateStr}T12:00:00.000Z`,
        source: "manual",
        recurring_template_id: null,
        deleted: 0 as any,
        sync_status: "pending",
        created_at: now,
        updated_at: now,
      });

      // Save pulse animation
      if (amountRef.current) {
        animate(amountRef.current, { scale: [1, 0.97, 1] }, springs.bouncy);
      }

      setToast({ visible: true, message: `✓ EUR ${(amountCents / 100).toFixed(2)} → ${sub?.name ?? "expense"} saved` });
    }

    // Trigger background sync
    sync().catch(console.error);

    // Reset form
    setAmount("");
    setAmountCents(0);
    setNote("");
    setShowNote(false);
    setShowDate(false);
    setDateStr(new Date().toISOString().split("T")[0]);

    // Re-focus amount input
    setTimeout(() => amountRef.current?.focus(), 100);
  }

  return (
    <div class="flex flex-col gap-4 px-4 pb-24">
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast({ visible: false, message: "" })}
      />

      <AmountInput
        value={amount}
        onAmountChange={(cents) => {
          setAmountCents(cents);
          setAmount(cents > 0 ? (cents / 100).toFixed(2) : "");
        }}
        inputRef={amountRef}
      />

      {/* Date label */}
      <div class="text-sm text-text-ghost px-1">{dateLabel}</div>

      {/* Category selector */}
      <CategorySelector
        categories={categories}
        subcategories={subcategories}
        onSelect={handleSelect}
        initialCategoryId={editing?.category_id}
      />

      {/* Expandable extras */}
      <div class="flex flex-col gap-3 px-1">
        {!showNote && (
          <button
            onClick={() => setShowNote(true)}
            class="text-sm text-text-secondary self-start"
          >
            + note
          </button>
        )}
        {showNote && <NoteInput value={note} onChange={setNote} />}

        {!showDate && (
          <button
            onClick={() => setShowDate(true)}
            class="text-sm text-text-secondary self-start"
          >
            + date
          </button>
        )}
        {showDate && (
          <input
            type="date"
            value={dateStr}
            onInput={(e) => setDateStr((e.target as HTMLInputElement).value)}
            class="w-full rounded-lg bg-surface px-4 py-3 text-sm text-text-primary outline-none border border-text-ghost/20 [color-scheme:dark]"
          />
        )}
      </div>
    </div>
  );
}

function formatDateLabel(dateStr: string, today: Date): string {
  const date = new Date(dateStr + "T12:00:00");
  const todayStr = today.toISOString().split("T")[0];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  if (dateStr === todayStr) {
    return `today, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split("T")[0]) {
    return `yesterday, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
