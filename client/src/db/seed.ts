import { db, type Category, type Subcategory } from './local';

// ── Seed data (mirrors server/src/db/seed.sql exactly) ───────────────────────

const NOW = new Date().toISOString();

const CATEGORIES: Category[] = [
  { id: 'cat-food',           name: 'food',           icon: 'food',           color: '#ff6b6b', sort_order: 1,  created_at: NOW, updated_at: NOW },
  { id: 'cat-living',         name: 'living',         icon: 'living',         color: '#ffa94d', sort_order: 2,  created_at: NOW, updated_at: NOW },
  { id: 'cat-household',      name: 'household',      icon: 'household',      color: '#ffd43b', sort_order: 3,  created_at: NOW, updated_at: NOW },
  { id: 'cat-transportation', name: 'transportation', icon: 'transportation', color: '#69db7c', sort_order: 4,  created_at: NOW, updated_at: NOW },
  { id: 'cat-health',         name: 'health',         icon: 'health',         color: '#ff8787', sort_order: 5,  created_at: NOW, updated_at: NOW },
  { id: 'cat-subscriptions',  name: 'subscriptions',  icon: 'subscriptions',  color: '#9775fa', sort_order: 6,  created_at: NOW, updated_at: NOW },
  { id: 'cat-entertainment',  name: 'entertainment',  icon: 'entertainment',  color: '#e599f7', sort_order: 7,  created_at: NOW, updated_at: NOW },
  { id: 'cat-insurance',      name: 'insurance',      icon: 'insurance',      color: '#66d9e8', sort_order: 8,  created_at: NOW, updated_at: NOW },
  { id: 'cat-apparel',        name: 'apparel',        icon: 'apparel',        color: '#f783ac', sort_order: 9,  created_at: NOW, updated_at: NOW },
  { id: 'cat-electronics',    name: 'electronics',    icon: 'electronics',    color: '#74c0fc', sort_order: 10, created_at: NOW, updated_at: NOW },
  { id: 'cat-charlie',           name: 'charlie',           icon: 'charlie',           color: '#fcc419', sort_order: 11, created_at: NOW, updated_at: NOW },
  { id: 'cat-education',      name: 'education',      icon: 'education',      color: '#63e6be', sort_order: 12, created_at: NOW, updated_at: NOW },
  { id: 'cat-travel',         name: 'travel',         icon: 'travel',         color: '#38d9a9', sort_order: 13, created_at: NOW, updated_at: NOW },
  { id: 'cat-gift',           name: 'gift',           icon: 'gift',           color: '#e599f7', sort_order: 14, created_at: NOW, updated_at: NOW },
  { id: 'cat-other',          name: 'other',          icon: 'other',          color: '#868e96', sort_order: 15, created_at: NOW, updated_at: NOW },
];

const SUBCATEGORIES: Subcategory[] = [
  // Food
  { id: 'sub-groceries',           category_id: 'cat-food',           name: 'groceries',         sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-eating-out',          category_id: 'cat-food',           name: 'eating out',        sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-coffee',              category_id: 'cat-food',           name: 'coffee',            sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-snacks',              category_id: 'cat-food',           name: 'snacks',            sort_order: 4, created_at: NOW, updated_at: NOW },
  { id: 'sub-delivery',            category_id: 'cat-food',           name: 'delivery',          sort_order: 5, created_at: NOW, updated_at: NOW },
  // Living
  { id: 'sub-rent',                category_id: 'cat-living',         name: 'rent',              sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-utilities',           category_id: 'cat-living',         name: 'utilities',         sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-internet',            category_id: 'cat-living',         name: 'internet',          sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-furniture',           category_id: 'cat-living',         name: 'furniture',         sort_order: 4, created_at: NOW, updated_at: NOW },
  // Household
  { id: 'sub-cleaning',            category_id: 'cat-household',      name: 'cleaning',          sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-repairs',             category_id: 'cat-household',      name: 'repairs',           sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-supplies',            category_id: 'cat-household',      name: 'supplies',          sort_order: 3, created_at: NOW, updated_at: NOW },
  // Transportation
  { id: 'sub-public-transit',      category_id: 'cat-transportation', name: 'public transit',    sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-taxi',                category_id: 'cat-transportation', name: 'taxi',              sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-fuel',                category_id: 'cat-transportation', name: 'fuel',              sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-parking',             category_id: 'cat-transportation', name: 'parking',           sort_order: 4, created_at: NOW, updated_at: NOW },
  // Health
  { id: 'sub-pharmacy',            category_id: 'cat-health',         name: 'pharmacy',          sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-doctor',              category_id: 'cat-health',         name: 'doctor',            sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-therapy',             category_id: 'cat-health',         name: 'therapy',           sort_order: 3, created_at: NOW, updated_at: NOW },
  // Subscriptions
  { id: 'sub-streaming',           category_id: 'cat-subscriptions',  name: 'streaming',         sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-software',            category_id: 'cat-subscriptions',  name: 'software',          sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-gym',                 category_id: 'cat-subscriptions',  name: 'gym',               sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-news',                category_id: 'cat-subscriptions',  name: 'news',              sort_order: 4, created_at: NOW, updated_at: NOW },
  // Entertainment
  { id: 'sub-movies',              category_id: 'cat-entertainment',  name: 'movies',            sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-events',              category_id: 'cat-entertainment',  name: 'events',            sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-hobbies',             category_id: 'cat-entertainment',  name: 'hobbies',           sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-games',               category_id: 'cat-entertainment',  name: 'games',             sort_order: 4, created_at: NOW, updated_at: NOW },
  // Insurance
  { id: 'sub-health-insurance',    category_id: 'cat-insurance',      name: 'health insurance',  sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-liability',           category_id: 'cat-insurance',      name: 'liability',         sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-household-insurance', category_id: 'cat-insurance',      name: 'household insurance', sort_order: 3, created_at: NOW, updated_at: NOW },
  // Apparel
  { id: 'sub-clothing',            category_id: 'cat-apparel',        name: 'clothing',          sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-shoes',               category_id: 'cat-apparel',        name: 'shoes',             sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-accessories',         category_id: 'cat-apparel',        name: 'accessories',       sort_order: 3, created_at: NOW, updated_at: NOW },
  // Electronics
  { id: 'sub-electronics-general', category_id: 'cat-electronics',    name: 'electronics',       sort_order: 1, created_at: NOW, updated_at: NOW },
  // Charlie
  { id: 'sub-charlie-general',        category_id: 'cat-charlie',           name: 'charlie',              sort_order: 1, created_at: NOW, updated_at: NOW },
  // Education
  { id: 'sub-books',               category_id: 'cat-education',      name: 'books',             sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-courses',             category_id: 'cat-education',      name: 'courses',           sort_order: 2, created_at: NOW, updated_at: NOW },
  // Travel
  { id: 'sub-flights',             category_id: 'cat-travel',         name: 'flights',           sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: 'sub-accommodation',       category_id: 'cat-travel',         name: 'accommodation',     sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: 'sub-activities',          category_id: 'cat-travel',         name: 'activities',        sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: 'sub-transport',           category_id: 'cat-travel',         name: 'transport',         sort_order: 4, created_at: NOW, updated_at: NOW },
  // Gift
  { id: 'sub-gift-general',        category_id: 'cat-gift',           name: 'gifts',             sort_order: 1, created_at: NOW, updated_at: NOW },
  // Other
  { id: 'sub-other-general',       category_id: 'cat-other',          name: 'other',             sort_order: 1, created_at: NOW, updated_at: NOW },
];

// ── Seed function ─────────────────────────────────────────────────────────────

export async function seedDatabase(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;

  await db.transaction('rw', db.categories, db.subcategories, async () => {
    await db.categories.bulkAdd(CATEGORIES);
    await db.subcategories.bulkAdd(SUBCATEGORIES);
  });
}
