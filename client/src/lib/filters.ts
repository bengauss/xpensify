import { signal } from "@preact/signals";

export const historyFilter = signal<{
  category: string;
  subcategory?: string;
  month?: string;
} | null>(null);
