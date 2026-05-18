import db from "../db/connection.js";

interface MerchantMemoryRow {
  merchant_normalized: string;
  category_id: string;
  subcategory_id: string;
  confirmation_count: number;
  last_confirmed_at: string;
}

/**
 * Resolve a normalized merchant name to its canonical form via merchant_aliases.
 * Returns the input unchanged when no alias exists. Walks one level only —
 * the merge endpoint flattens aliases transitively when they're created, so
 * we never need to follow chains here.
 */
export function resolveCanonical(merchantNormalized: string): string {
  if (!merchantNormalized) return merchantNormalized;
  const row = db
    .prepare(
      `SELECT canonical_normalized FROM merchant_aliases
       WHERE alias_normalized = ?`,
    )
    .get(merchantNormalized) as { canonical_normalized: string } | undefined;
  return row ? row.canonical_normalized : merchantNormalized;
}

/**
 * Look up the household's merchant memory entry for the given merchant.
 * Returns null if no mapping exists. Hot path — called on every Apple Pay
 * shortcut hit.
 */
export function lookupMerchantMemory(
  merchantNormalized: string,
): MerchantMemoryRow | null {
  if (!merchantNormalized) return null;
  const row = db
    .prepare(
      `SELECT merchant_normalized, category_id, subcategory_id,
              confirmation_count, last_confirmed_at
       FROM merchant_categories
       WHERE merchant_normalized = ?`,
    )
    .get(merchantNormalized) as MerchantMemoryRow | undefined;
  return row ?? null;
}

/**
 * Upsert merchant → (category, subcategory). If the mapping already exists
 * with the same (category, subcategory) the confirmation_count is incremented.
 * If it disagrees, the row is rewritten and the count resets to 1.
 *
 * `initialCount` lets the caller insert a fresh mapping at a count > 1 — used
 * when the user accepts a Gemini Flash suggestion: that counts as two votes
 * (Flash + user), so the very next hit at the merchant auto-saves.
 */
export function upsertMerchantMemory(
  merchantNormalized: string,
  categoryId: string,
  subcategoryId: string,
  nowIso: string,
  options?: { initialCount?: number },
): void {
  if (!merchantNormalized) return;
  const existing = db
    .prepare(
      `SELECT category_id, subcategory_id
       FROM merchant_categories
       WHERE merchant_normalized = ?`,
    )
    .get(merchantNormalized) as
    | { category_id: string; subcategory_id: string }
    | undefined;

  if (!existing) {
    const count = options?.initialCount ?? 1;
    db.prepare(
      `INSERT INTO merchant_categories
         (merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(merchantNormalized, categoryId, subcategoryId, count, nowIso);
    return;
  }

  if (existing.category_id === categoryId && existing.subcategory_id === subcategoryId) {
    db.prepare(
      `UPDATE merchant_categories
       SET confirmation_count = confirmation_count + 1,
           last_confirmed_at = ?
       WHERE merchant_normalized = ?`,
    ).run(nowIso, merchantNormalized);
    return;
  }

  db.prepare(
    `UPDATE merchant_categories
     SET category_id = ?,
         subcategory_id = ?,
         confirmation_count = 1,
         last_confirmed_at = ?
     WHERE merchant_normalized = ?`,
  ).run(categoryId, subcategoryId, nowIso, merchantNormalized);
}

/**
 * Reset a merchant memory's confirmation count to 1, optionally rewriting
 * the mapping. Called when a user edits an auto-saved Apple Pay expense and
 * changes its category — the next transaction at this merchant should go
 * pending so a household member can confirm the new mapping.
 */
export function resetMerchantMemory(
  merchantNormalized: string,
  categoryId: string,
  subcategoryId: string,
  nowIso: string,
): void {
  if (!merchantNormalized) return;
  const existing = db
    .prepare(
      `SELECT 1 FROM merchant_categories
       WHERE merchant_normalized = ?`,
    )
    .get(merchantNormalized);
  if (existing) {
    db.prepare(
      `UPDATE merchant_categories
       SET category_id = ?,
           subcategory_id = ?,
           confirmation_count = 1,
           last_confirmed_at = ?
       WHERE merchant_normalized = ?`,
    ).run(categoryId, subcategoryId, nowIso, merchantNormalized);
  } else {
    db.prepare(
      `INSERT INTO merchant_categories
         (merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, 1, ?)`,
    ).run(merchantNormalized, categoryId, subcategoryId, nowIso);
  }
}
