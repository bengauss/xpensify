import { signal } from "@preact/signals";

export interface AnalyticsDrilldown {
  categoryId?: string;
  subcategoryId?: string;
}

export const analyticsDrilldown = signal<AnalyticsDrilldown | null>(null);
