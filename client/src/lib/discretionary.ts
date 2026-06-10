import type { Expense } from "@/db/local";
import { dateKey, monthKey } from "@/lib/format";

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function roundToHundred(cents: number): number {
  return Math.round(cents / 10000) * 10000;
}

/**
 * Compute the current month's discretionary spend (manual + apple-pay confirmed)
 * and a trailing 3-month average. Outlier guard drops any month over 2× the
 * median so a one-off big purchase doesn't spike the running average.
 *
 * Returns null only when the expenses array itself is undefined (loading state).
 * If there's no historical data, `avg` is null but `current` is still computed.
 */
export function computeDiscretionary(
  expenses: Expense[] | undefined,
  now: Date = new Date(),
): { current: number; avg: number | null } | null {
  if (!expenses) return null;

  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curKey = monthKey(curYear, curMonth);

  const currentTotal = expenses
    .filter((e) => dateKey(e.timestamp).startsWith(curKey) && e.deleted === 0 && e.source !== "recurring")
    .reduce((s, e) => s + e.amount, 0);

  let y = curYear;
  let m = curMonth;
  const monthTotals: number[] = [];
  for (let i = 0; i < 3; i++) {
    ({ year: y, month: m } = prevMonth(y, m));
    const key = monthKey(y, m);
    const total = expenses
      .filter((e) => dateKey(e.timestamp).startsWith(key) && e.deleted === 0 && e.source !== "recurring")
      .reduce((s, e) => s + e.amount, 0);
    monthTotals.push(total);
  }

  const hasData = monthTotals.some((t) => t > 0);
  if (!hasData) return { current: currentTotal, avg: null };

  const sorted = [...monthTotals].sort((a, b) => a - b);
  const median = sorted[1];
  const filtered = monthTotals.filter((t) => t <= median * 2);
  const avg = filtered.length > 0
    ? filtered.reduce((s, t) => s + t, 0) / filtered.length
    : monthTotals.reduce((s, t) => s + t, 0) / monthTotals.length;

  return { current: currentTotal, avg: roundToHundred(avg) };
}
