import { db as defaultDb } from "@/db/local";

export interface CategoryBreakdownItem {
  category_id: string;
  category_name: string;
  category_color: string;
  total: number;
}

export interface MonthlyTrendItem {
  year: number;
  month: number;
  total: number;
}

/** Sum all non-deleted expenses for a given year+month. Returns cents. */
export async function getMonthlyTotal(
  db: typeof defaultDb,
  year: number,
  month: number
): Promise<number> {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const expenses = await db.expenses
    .filter((e) => !e.deleted && e.timestamp.startsWith(ym))
    .toArray();
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Sum per category for a given month, sorted descending by total. */
export async function getCategoryBreakdown(
  db: typeof defaultDb,
  year: number,
  month: number
): Promise<CategoryBreakdownItem[]> {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const expenses = await db.expenses
    .filter((e) => !e.deleted && e.timestamp.startsWith(ym))
    .toArray();

  const categories = await db.categories.toArray();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const totals = new Map<string, number>();
  for (const e of expenses) {
    totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.amount);
  }

  const result: CategoryBreakdownItem[] = [];
  for (const [category_id, total] of totals.entries()) {
    const cat = catMap.get(category_id);
    result.push({
      category_id,
      category_name: cat?.name ?? "other",
      category_color: cat?.color ?? "#868e96",
      total,
    });
  }

  result.sort((a, b) => b.total - a.total);
  return result;
}

/** Total per month across all historical data, sorted chronologically. */
export async function getMonthlyTrend(
  db: typeof defaultDb
): Promise<MonthlyTrendItem[]> {
  const expenses = await db.expenses
    .filter((e) => !e.deleted)
    .toArray();

  const totals = new Map<string, number>();
  for (const e of expenses) {
    const ym = e.timestamp.slice(0, 7); // "YYYY-MM"
    totals.set(ym, (totals.get(ym) ?? 0) + e.amount);
  }

  const result: MonthlyTrendItem[] = [];
  for (const [ym, total] of totals.entries()) {
    const [yearStr, monthStr] = ym.split("-");
    result.push({ year: parseInt(yearStr, 10), month: parseInt(monthStr, 10), total });
  }

  result.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  return result;
}
