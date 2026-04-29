import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { pendingExpenses, refreshPendingExpenses, confirmingPending } from "@/lib/pending";
import type { PendingExpense } from "@/db/local";
import { formatMoney, MONTHS_SHORT } from "@/lib/format";
import { usePressScale } from "@/lib/usePressScale";

function relativeTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const now = new Date();
  const dKey = d.toISOString().split("T")[0];
  const todayKey = now.toISOString().split("T")[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split("T")[0];

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  if (dKey === todayKey) return `today, ${hh}:${mm}`;
  if (dKey === yesterdayKey) return `yesterday, ${hh}:${mm}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${hh}:${mm}`;
}

function PendingRow({ expense, onTap }: { expense: PendingExpense; onTap: () => void }) {
  const press = usePressScale<HTMLButtonElement>(0.97);
  return (
    <button
      ref={press.ref}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={onTap}
      class="w-full text-left flex items-center gap-3 px-1 cursor-pointer bg-transparent border-0"
      style={{ paddingTop: 12, paddingBottom: 12, WebkitTapHighlightColor: "transparent" }}
    >
      {/* Question-mark uncategorized placeholder */}
      <div
        class="flex-shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 36, height: 36, backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-secondary)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-medium tabular-nums" style={{ color: "var(--color-text-body)" }}>
            {formatMoney(expense.amount)}
          </span>
        </div>
        <p class="text-sm truncate" style={{ color: "var(--color-text-body)" }}>
          {expense.note ?? "—"}
        </p>
        <p class="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          {relativeTimeLabel(expense.timestamp)}
        </p>
      </div>

      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-hint)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

export default function ConfirmScreen() {
  const { route } = useLocation();
  const items = pendingExpenses.value;
  const backPress = usePressScale<HTMLButtonElement>(0.95);

  useEffect(() => {
    refreshPendingExpenses().catch(() => {});
  }, []);

  function handleTap(expense: PendingExpense) {
    confirmingPending.value = expense;
    route("/");
  }

  const sorted = [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div class="flex flex-col px-4 pt-2 safe-pb-lg">
      <div class="flex items-center gap-3 pb-3">
        <button
          ref={backPress.ref}
          onPointerDown={backPress.onPointerDown}
          onPointerUp={backPress.onPointerUp}
          onPointerCancel={backPress.onPointerCancel}
          onClick={() => route("/")}
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
          confirm expenses
        </h1>
      </div>

      {sorted.length === 0 ? (
        <div class="flex flex-1 items-center justify-center py-16">
          <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            no expenses to confirm
          </p>
        </div>
      ) : (
        <div class="flex flex-col">
          {sorted.map((expense) => (
            <PendingRow key={expense.id} expense={expense} onTap={() => handleTap(expense)} />
          ))}
        </div>
      )}
    </div>
  );
}
