import { signal } from "@preact/signals";

export const historyFilter = signal<{
  category: string;
  month: string;
} | null>(null);
