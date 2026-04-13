-- Categories (PRD section 3.8)
INSERT OR IGNORE INTO categories (id, name, icon, color, sort_order) VALUES
  ('cat-food', 'food', 'food', '#ff6b6b', 1),
  ('cat-living', 'living', 'living', '#ffa94d', 2),
  ('cat-household', 'household', 'household', '#ffd43b', 3),
  ('cat-transportation', 'transportation', 'transportation', '#69db7c', 4),
  ('cat-health', 'health', 'health', '#ff8787', 5),
  ('cat-subscriptions', 'subscriptions', 'subscriptions', '#9775fa', 6),
  ('cat-entertainment', 'entertainment', 'entertainment', '#e599f7', 7),
  ('cat-insurance', 'insurance', 'insurance', '#66d9e8', 8),
  ('cat-apparel', 'apparel', 'apparel', '#f783ac', 9),
  ('cat-electronics', 'electronics', 'electronics', '#74c0fc', 10),
  ('cat-charlie', 'charlie', 'charlie', '#fcc419', 11),
  ('cat-education', 'education', 'education', '#63e6be', 12),
  ('cat-travel', 'travel', 'travel', '#38d9a9', 13),
  ('cat-gift', 'gift', 'gift', '#e599f7', 14),
  ('cat-other', 'other', 'other', '#868e96', 15);

-- Subcategories (PRD section 3.8)
INSERT OR IGNORE INTO subcategories (id, category_id, name, sort_order) VALUES
  -- Food
  ('sub-groceries', 'cat-food', 'groceries', 1),
  ('sub-eating-out', 'cat-food', 'eating out', 2),
  ('sub-coffee', 'cat-food', 'coffee', 3),
  ('sub-snacks', 'cat-food', 'snacks', 4),
  ('sub-delivery', 'cat-food', 'delivery', 5),
  -- Living
  ('sub-rent', 'cat-living', 'rent', 1),
  ('sub-utilities', 'cat-living', 'utilities', 2),
  ('sub-internet', 'cat-living', 'internet', 3),
  ('sub-furniture', 'cat-living', 'furniture', 4),
  -- Household
  ('sub-cleaning', 'cat-household', 'cleaning', 1),
  ('sub-repairs', 'cat-household', 'repairs', 2),
  ('sub-supplies', 'cat-household', 'supplies', 3),
  -- Transportation
  ('sub-public-transit', 'cat-transportation', 'public transit', 1),
  ('sub-taxi', 'cat-transportation', 'taxi', 2),
  ('sub-fuel', 'cat-transportation', 'fuel', 3),
  ('sub-parking', 'cat-transportation', 'parking', 4),
  -- Health
  ('sub-pharmacy', 'cat-health', 'pharmacy', 1),
  ('sub-doctor', 'cat-health', 'doctor', 2),
  ('sub-therapy', 'cat-health', 'therapy', 3),
  -- Subscriptions
  ('sub-streaming', 'cat-subscriptions', 'streaming', 1),
  ('sub-software', 'cat-subscriptions', 'software', 2),
  ('sub-gym', 'cat-subscriptions', 'gym', 3),
  ('sub-news', 'cat-subscriptions', 'news', 4),
  -- Entertainment
  ('sub-movies', 'cat-entertainment', 'movies', 1),
  ('sub-events', 'cat-entertainment', 'events', 2),
  ('sub-hobbies', 'cat-entertainment', 'hobbies', 3),
  ('sub-games', 'cat-entertainment', 'games', 4),
  -- Insurance
  ('sub-health-insurance', 'cat-insurance', 'health insurance', 1),
  ('sub-liability', 'cat-insurance', 'liability', 2),
  ('sub-household-insurance', 'cat-insurance', 'household insurance', 3),
  -- Apparel
  ('sub-clothing', 'cat-apparel', 'clothing', 1),
  ('sub-shoes', 'cat-apparel', 'shoes', 2),
  ('sub-accessories', 'cat-apparel', 'accessories', 3),
  -- Electronics
  ('sub-electronics-general', 'cat-electronics', 'electronics', 1),
  -- Charlie
  ('sub-charlie-general', 'cat-charlie', 'charlie', 1),
  -- Education
  ('sub-books', 'cat-education', 'books', 1),
  ('sub-courses', 'cat-education', 'courses', 2),
  -- Travel
  ('sub-flights', 'cat-travel', 'flights', 1),
  ('sub-accommodation', 'cat-travel', 'accommodation', 2),
  ('sub-activities', 'cat-travel', 'activities', 3),
  ('sub-transport', 'cat-travel', 'transport', 4),
  -- Gift
  ('sub-gift-general', 'cat-gift', 'gifts', 1),
  -- Other
  ('sub-other-general', 'cat-other', 'other', 1);
