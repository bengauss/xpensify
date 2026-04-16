import { db } from "./local";
import { CATEGORIES, SUBCATEGORIES } from "@/lib/categories";

export async function seedDatabase(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;

  await db.transaction("rw", db.categories, db.subcategories, async () => {
    await db.categories.bulkAdd(CATEGORIES);
    await db.subcategories.bulkAdd(SUBCATEGORIES);
  });
}
