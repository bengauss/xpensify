// Offline-bootstrap copy of the category list. The server is the source of
// truth — on every sync the client receives the full categories +
// subcategories list from `/api/sync` and bulk-replaces this seed in Dexie.
// This file only matters before the first sync completes on a fresh device
// (≤1s on a normal connection). If the deployer added custom categories in
// `config/categories.yaml`, those won't appear here, but they'll arrive in
// the first sync — so it's a brief mismatch, not a correctness problem.
import type { Category, Subcategory } from "@/db/local";

const NOW = new Date().toISOString();

export const CATEGORIES: Category[] = [
  { id: "cat-food",           name: "food",           icon: "food",           color: "#ff6b6b", sort_order: 1,  created_at: NOW, updated_at: NOW },
  { id: "cat-household",      name: "household",      icon: "household",      color: "#ffd43b", sort_order: 2,  created_at: NOW, updated_at: NOW },
  { id: "cat-health",         name: "health",         icon: "health",         color: "#69db7c", sort_order: 3,  created_at: NOW, updated_at: NOW },
  { id: "cat-apparel",        name: "apparel",        icon: "apparel",        color: "#f783ac", sort_order: 4,  created_at: NOW, updated_at: NOW },
  { id: "cat-transportation", name: "transportation", icon: "transportation", color: "#74c0fc", sort_order: 5,  created_at: NOW, updated_at: NOW },
  { id: "cat-entertainment",  name: "entertainment",  icon: "entertainment",  color: "#e599f7", sort_order: 7,  created_at: NOW, updated_at: NOW },
  { id: "cat-education",      name: "education",      icon: "education",      color: "#63e6be", sort_order: 8,  created_at: NOW, updated_at: NOW },
  { id: "cat-electronics",    name: "electronics",    icon: "electronics",    color: "#66d9e8", sort_order: 9,  created_at: NOW, updated_at: NOW },
  { id: "cat-travel",         name: "travel",         icon: "travel",         color: "#38d9a9", sort_order: 10, created_at: NOW, updated_at: NOW },
  { id: "cat-gift",           name: "gift",           icon: "gift",           color: "#ff8787", sort_order: 11, created_at: NOW, updated_at: NOW },
  { id: "cat-insurance",      name: "insurance",      icon: "insurance",      color: "#fcc419", sort_order: 12, created_at: NOW, updated_at: NOW },
  { id: "cat-living",         name: "living",         icon: "living",         color: "#ffa94d", sort_order: 13, created_at: NOW, updated_at: NOW },
  { id: "cat-subscriptions",  name: "subscriptions",  icon: "subscriptions",  color: "#66d9e8", sort_order: 14, created_at: NOW, updated_at: NOW },
  { id: "cat-other",          name: "other",          icon: "other",          color: "#868e96", sort_order: 15, created_at: NOW, updated_at: NOW },
];

export const SUBCATEGORIES: Subcategory[] = [
  { id: "sub-groceries",           category_id: "cat-food",           name: "groceries",     sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-delivery",            category_id: "cat-food",           name: "delivery",      sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-eating-out",          category_id: "cat-food",           name: "eating out",    sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-drinks",              category_id: "cat-food",           name: "drinks",        sort_order: 4, created_at: NOW, updated_at: NOW },
  { id: "sub-rent",                category_id: "cat-living",         name: "rent",          sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-mortgage",            category_id: "cat-living",         name: "mortgage",      sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-fees",                category_id: "cat-living",         name: "fees",          sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-cleaning",            category_id: "cat-household",      name: "cleaning",      sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-hh-utilities",        category_id: "cat-household",      name: "utilities",     sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-hh-furniture",        category_id: "cat-household",      name: "furniture",     sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-kitchen",             category_id: "cat-household",      name: "kitchen",       sort_order: 4, created_at: NOW, updated_at: NOW },
  { id: "sub-toiletries",          category_id: "cat-household",      name: "toiletries",    sort_order: 5, created_at: NOW, updated_at: NOW },
  { id: "sub-appliances",          category_id: "cat-household",      name: "appliances",    sort_order: 6, created_at: NOW, updated_at: NOW },
  { id: "sub-hh-other",            category_id: "cat-household",      name: "other",         sort_order: 7, created_at: NOW, updated_at: NOW },
  { id: "sub-public",              category_id: "cat-transportation", name: "public",        sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-taxi",                category_id: "cat-transportation", name: "taxi",          sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-car",                 category_id: "cat-transportation", name: "car",           sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-medical",             category_id: "cat-health",         name: "medical",       sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-working-out",         category_id: "cat-health",         name: "working out",   sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-sports-gear",         category_id: "cat-health",         name: "sports gear",   sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-subscriptions",       category_id: "cat-subscriptions",  name: "subscriptions", sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-books",               category_id: "cat-entertainment",  name: "books",         sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-movie-show",          category_id: "cat-entertainment",  name: "movie/show",    sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-video-games",         category_id: "cat-entertainment",  name: "video games",   sort_order: 3, created_at: NOW, updated_at: NOW },
  { id: "sub-insurance",           category_id: "cat-insurance",      name: "insurance",     sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-clothes",             category_id: "cat-apparel",        name: "clothes",       sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-shoes",               category_id: "cat-apparel",        name: "shoes",         sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-electronics-general", category_id: "cat-electronics",    name: "electronics",   sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-education",           category_id: "cat-education",      name: "education",     sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-travel",              category_id: "cat-travel",         name: "travel",        sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-gift",                category_id: "cat-gift",           name: "gift",          sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "sub-donation",            category_id: "cat-gift",           name: "donation",      sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "sub-other-general",       category_id: "cat-other",          name: "other",         sort_order: 1, created_at: NOW, updated_at: NOW },
];

import { signal } from "@preact/signals";
import { db } from "@/db/local";

export const categoriesSignal = signal<Category[]>(CATEGORIES);
export const subcategoriesSignal = signal<Subcategory[]>(SUBCATEGORIES);

export async function refreshCategories(): Promise<void> {
  try {
    const cats = await db.categories.toArray();
    const subs = await db.subcategories.toArray();

    if (cats.length > 0) {
      cats.sort((a, b) => a.sort_order - b.sort_order);
      categoriesSignal.value = cats;
    }
    if (subs.length > 0) {
      subs.sort((a, b) => a.sort_order - b.sort_order);
      subcategoriesSignal.value = subs;
    }
  } catch (err) {
    console.error("Failed to refresh categories from IndexedDB:", err);
  }
}

// Initial async load from Dexie database on module import
refreshCategories().catch(console.error);
