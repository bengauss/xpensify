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
  /**
   * 1 when the row entered as 'confirmed' directly from the Apple Pay webhook
   * via merchant memory (count ≥ 2) without user confirmation. Survives edits.
   * Drives the apple marker in History so the user can spot-check accuracy.
   */
  auto_saved: number;
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
  /** Pre-filled suggestion (memory or Flash). Null when the merchant is unknown
   *  AND Flash didn't infer anything — the confirm screen renders no pre-selection. */
  category_id: string | null;
  subcategory_id: string | null;
  /** Origin of the suggestion. "memory" means the user has confirmed this
   *  merchant once before; "flash" means Gemini inferred it with no prior
   *  user input. Drives the hint text on the Confirm screen. */
  suggestion_source?: "memory" | "flash" | null;
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

    // v3: add [deleted+timestamp] compound index so History can range-scan
    // non-deleted rows in timestamp order without loading every expense and
    // JS-filtering. With a year+ of data this matters; without the index
    // Dexie ignored the .filter(deleted=0) optimizer hint.
    this.version(3).stores({
      expenses:
        'id, timestamp, category_id, sync_status, updated_at, [deleted+timestamp]',
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
