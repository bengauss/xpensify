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

/** YYYY-MM-DD from an ISO-8601 timestamp converted to local time. */
export function dateKey(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return timestamp;
  }
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) {
    return timestamp.split("T")[0];
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD for today in local time. Used wherever we compare against expense timestamps. */
export function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
