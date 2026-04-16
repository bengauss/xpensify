import { signal } from "@preact/signals";
import type { Expense } from "@/db/local";

export const editingExpense = signal<Expense | null>(null);
