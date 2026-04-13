-- Categories
INSERT OR REPLACE INTO categories (id, name, icon, color, sort_order) VALUES
  ('cat-food', 'food', 'food', '#ff6b6b', 1),
  ('cat-living', 'living', 'living', '#74c0fc', 2),
  ('cat-household', 'household', 'household', '#ffa94d', 3),
  ('cat-charlie', 'charlie', 'charlie', '#fcc419', 4),
  ('cat-health', 'health', 'health', '#9775fa', 5),
  ('cat-transportation', 'transportation', 'transportation', '#69db7c', 6),
  ('cat-subscriptions', 'subscriptions', 'subscriptions', '#66d9e8', 7),
  ('cat-apparel', 'apparel', 'apparel', '#f783ac', 8),
  ('cat-entertainment', 'entertainment', 'entertainment', '#e599f7', 9),
  ('cat-insurance', 'insurance', 'insurance', '#ff8787', 10),
  ('cat-electronics', 'electronics', 'electronics', '#ffd43b', 11),
  ('cat-education', 'education', 'education', '#63e6be', 12),
  ('cat-travel', 'travel', 'travel', '#38d9a9', 13),
  ('cat-gift', 'gift', 'gift', '#e599f7', 14),
  ('cat-other', 'other', 'other', '#868e96', 15);

-- Subcategories
DELETE FROM subcategories WHERE id NOT IN (
  'sub-groceries','sub-delivery','sub-eating-out','sub-drinks',
  'sub-rent','sub-mortgage','sub-fees',
  'sub-cleaning','sub-hh-utilities','sub-hh-furniture','sub-kitchen','sub-toiletries','sub-appliances','sub-hh-other',
  'sub-public','sub-taxi','sub-car',
  'sub-medical','sub-working-out','sub-sports-gear',
  'sub-subscriptions',
  'sub-books','sub-movie-show','sub-video-games',
  'sub-insurance',
  'sub-clothes','sub-shoes',
  'sub-electronics-general',
  'sub-charlie-general',
  'sub-education',
  'sub-travel',
  'sub-gift','sub-donation',
  'sub-other-general'
);

INSERT OR REPLACE INTO subcategories (id, category_id, name, sort_order) VALUES
  -- Food
  ('sub-groceries', 'cat-food', 'groceries', 1),
  ('sub-delivery', 'cat-food', 'delivery', 2),
  ('sub-eating-out', 'cat-food', 'eating out', 3),
  ('sub-drinks', 'cat-food', 'drinks', 4),
  -- Living
  ('sub-rent', 'cat-living', 'rent', 1),
  ('sub-mortgage', 'cat-living', 'mortgage', 2),
  ('sub-fees', 'cat-living', 'fees', 3),
  -- Household
  ('sub-cleaning', 'cat-household', 'cleaning', 1),
  ('sub-hh-utilities', 'cat-household', 'utilities', 2),
  ('sub-hh-furniture', 'cat-household', 'furniture', 3),
  ('sub-kitchen', 'cat-household', 'kitchen', 4),
  ('sub-toiletries', 'cat-household', 'toiletries', 5),
  ('sub-appliances', 'cat-household', 'appliances', 6),
  ('sub-hh-other', 'cat-household', 'other', 7),
  -- Transportation
  ('sub-public', 'cat-transportation', 'public', 1),
  ('sub-taxi', 'cat-transportation', 'taxi', 2),
  ('sub-car', 'cat-transportation', 'car', 3),
  -- Health
  ('sub-medical', 'cat-health', 'medical', 1),
  ('sub-working-out', 'cat-health', 'working out', 2),
  ('sub-sports-gear', 'cat-health', 'sports gear', 3),
  -- Subscriptions
  ('sub-subscriptions', 'cat-subscriptions', 'subscriptions', 1),
  -- Entertainment
  ('sub-books', 'cat-entertainment', 'books', 1),
  ('sub-movie-show', 'cat-entertainment', 'movie/show', 2),
  ('sub-video-games', 'cat-entertainment', 'video games', 3),
  -- Insurance
  ('sub-insurance', 'cat-insurance', 'insurance', 1),
  -- Apparel
  ('sub-clothes', 'cat-apparel', 'clothes', 1),
  ('sub-shoes', 'cat-apparel', 'shoes', 2),
  -- Electronics
  ('sub-electronics-general', 'cat-electronics', 'electronics', 1),
  -- Charlie
  ('sub-charlie-general', 'cat-charlie', 'charlie', 1),
  -- Education
  ('sub-education', 'cat-education', 'education', 1),
  -- Travel
  ('sub-travel', 'cat-travel', 'travel', 1),
  -- Gift
  ('sub-gift', 'cat-gift', 'gift', 1),
  ('sub-donation', 'cat-gift', 'donation', 2),
  -- Other
  ('sub-other-general', 'cat-other', 'other', 1);
