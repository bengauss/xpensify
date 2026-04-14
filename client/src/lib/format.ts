/**
 * Format integer cents as "1,234.56" — en-style thousands comma, dot decimal.
 * Used across the app for displaying amounts in History, Analytics, Recurring, etc.
 */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format integer cents as "1,234" — whole euros, en-style thousands separator. */
export function formatMoneyWhole(cents: number): string {
  return Math.round(cents / 100).toLocaleString("en-US");
}

/** "EUR 1,234.56" — money with EUR prefix. */
export function formatEur(cents: number): string {
  return `EUR ${formatMoney(cents)}`;
}

/** YYYY-MM-DD from an ISO-8601 timestamp without parsing it. */
export function dateKey(timestamp: string): string {
  return timestamp.split("T")[0];
}

/** YYYY-MM-DD for today (UTC). Used wherever we compare against expense timestamps. */
export function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/** YYYY-MM for an explicit year/month pair. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Short month names — jan, feb, ... — lowercase to match app typography. */
export const MONTHS_SHORT: readonly string[] = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
