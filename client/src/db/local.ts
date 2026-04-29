import Dexie, { type Table } from 'dexie';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  /** Amount stored as integer cents (e.g. 1099 = $10.99) */
  amount: number;
  note: string | null;
  tags: string | null;
  image_url: string | null;
  /** ISO-8601 date string (YYYY-MM-DD) */
  timestamp: string;
  source: 'manual' | 'import' | 'recurring' | 'apple-pay';
  recurring_template_id: string | null;
  /** 0 = not deleted, 1 = deleted (INTEGER to match server) */
  deleted: number;
  /**
   * 'pending' = awaiting user confirmation (Apple Pay shortcut). Server keeps
   * pending expenses out of sync responses, so locally Expense rows are
   * always 'confirmed'. Stored on the type for completeness only.
   */
  status: 'pending' | 'confirmed';
  /** Client-only field — never synced to server */
  sync_status: 'pending' | 'synced' | 'error';
  created_at: string;
  updated_at: string;
}

export interface PendingExpense {
  id: string;
  amount: number;
  note: string | null;
  timestamp: string;
  source: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringTemplate {
  id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  /** Amount stored as integer cents */
  amount: number;
  note: string | null;
  frequency: 'weekly' | 'monthly' | 'yearly';
  day_of_month: number | null;
  /** YYYY-MM-DD — anchor month/day for yearly recurrences (first occurrence) */
  start_date: string | null;
  /** 0 = inactive, 1 = active */
  active: number;
  next_due: string;
  created_at: string;
  updated_at: string;
  // joined fields (populated when fetched from server)
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  subcategory_name?: string;
}

// ── Database class ────────────────────────────────────────────────────────────

class XpensifyDB extends Dexie {
  expenses!: Table<Expense, string>;
  categories!: Table<Category, string>;
  subcategories!: Table<Subcategory, string>;
  recurring_templates!: Table<RecurringTemplate, string>;

  constructor() {
    super('xpensify');

    this.version(1).stores({
      // Primary key first, then indexed fields
      expenses:
        'id, timestamp, category_id, sync_status, updated_at',
      categories:
        'id',
      subcategories:
        'id, category_id',
    });

    this.version(2).stores({
      expenses:
        'id, timestamp, category_id, sync_status, updated_at',
      categories:
        'id',
      subcategories:
        'id, category_id',
      recurring_templates:
        'id, user_id, category_id, frequency, active, next_due',
    });
  }
}

export const db = new XpensifyDB();
