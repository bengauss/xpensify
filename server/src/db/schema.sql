CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#6c9cff',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT REFERENCES categories(id),
  subcategory_id TEXT REFERENCES subcategories(id),
  amount INTEGER NOT NULL,
  note TEXT,
  tags TEXT,
  image_url TEXT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  recurring_template_id TEXT REFERENCES recurring_templates(id),
  deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  auto_saved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_updated ON expenses(updated_at);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  subcategory_id TEXT NOT NULL REFERENCES subcategories(id),
  amount INTEGER NOT NULL,
  note TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'monthly', 'yearly')),
  day_of_month INTEGER,
  start_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  next_due TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  daily_reminder INTEGER NOT NULL DEFAULT 0,
  daily_reminder_time TEXT NOT NULL DEFAULT '21:00',
  weekly_summary INTEGER NOT NULL DEFAULT 0,
  weekly_summary_day INTEGER NOT NULL DEFAULT 0,
  weekly_summary_time TEXT NOT NULL DEFAULT '09:00',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
-- idx_expenses_status is created in migrate.ts after the status column is
-- ensured to exist on legacy DBs.

-- merchant_categories: household-wide memory of the (merchant → category)
-- mapping learned from confirmed Apple Pay expenses. Shared between users —
-- both household members contribute confirmations to the same row.
CREATE TABLE IF NOT EXISTS merchant_categories (
  merchant_normalized TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  subcategory_id TEXT NOT NULL REFERENCES subcategories(id),
  confirmation_count INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at TEXT NOT NULL
);

-- merchant_aliases: collapses multiple POS-name variants onto one canonical
-- merchant. When the webhook receives a normalized name that has an alias
-- entry, the row's category memory is looked up under the canonical name and
-- the expense's `note` is stamped with the canonical name too. Household-wide
-- like merchant_categories.
CREATE TABLE IF NOT EXISTS merchant_aliases (
  alias_normalized TEXT PRIMARY KEY,
  canonical_normalized TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchant_aliases_canonical
  ON merchant_aliases(canonical_normalized);
