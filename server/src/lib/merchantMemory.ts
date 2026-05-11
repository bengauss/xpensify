import db from "../db/connection.js";

interface MerchantMemoryRow {
  user_id: string;
  merchant_normalized: string;
  category_id: string;
  subcategory_id: string;
  confirmation_count: number;
  last_confirmed_at: string;
}

/**
 * Look up a merchant memory entry for (user, merchant). Returns null if no
 * mapping exists. Hot path — called on every Apple Pay shortcut hit.
 */
export function lookupMerchantMemory(
  userId: string,
  merchantNormalized: string,
): MerchantMemoryRow | null {
  if (!merchantNormalized) return null;
  const row = db
    .prepare(
      `SELECT user_id, merchant_normalized, category_id, subcategory_id,
              confirmation_count, last_confirmed_at
       FROM merchant_categories
       WHERE user_id = ? AND merchant_normalized = ?`,
    )
    .get(userId, merchantNormalized) as MerchantMemoryRow | undefined;
  return row ?? null;
}

/**
 * Upsert (user, merchant) → (category, subcategory). If the mapping already
 * exists with the same (category, subcategory) the confirmation_count is
 * incremented. If the mapping exists but disagrees, the row is rewritten and
 * the count resets to 1 — the user just disagreed with prior memory, so we
 * start over rather than keep accumulating against a stale mapping.
 *
 * `initialCount` lets the caller insert a fresh mapping at a count > 1 — used
 * when the user accepts a Gemini Flash suggestion: that counts as two votes
 * (Flash + user), so the very next hit at the merchant auto-saves.
 */
export function upsertMerchantMemory(
  userId: string,
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
       WHERE user_id = ? AND merchant_normalized = ?`,
    )
    .get(userId, merchantNormalized) as
    | { category_id: string; subcategory_id: string }
    | undefined;

  if (!existing) {
    const count = options?.initialCount ?? 1;
    db.prepare(
      `INSERT INTO merchant_categories
         (user_id, merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, merchantNormalized, categoryId, subcategoryId, count, nowIso);
    return;
  }

  if (existing.category_id === categoryId && existing.subcategory_id === subcategoryId) {
    db.prepare(
      `UPDATE merchant_categories
       SET confirmation_count = confirmation_count + 1,
           last_confirmed_at = ?
       WHERE user_id = ? AND merchant_normalized = ?`,
    ).run(nowIso, userId, merchantNormalized);
    return;
  }

  db.prepare(
    `UPDATE merchant_categories
     SET category_id = ?,
         subcategory_id = ?,
         confirmation_count = 1,
         last_confirmed_at = ?
     WHERE user_id = ? AND merchant_normalized = ?`,
  ).run(categoryId, subcategoryId, nowIso, userId, merchantNormalized);
}

/**
 * Reset a merchant memory's confirmation count to 1, optionally rewriting the
 * mapping. Called when the user edits an auto-saved Apple Pay expense and
 * changes its category — the next transaction at this merchant should go
 * pending so the user can confirm the new mapping.
 */
export function resetMerchantMemory(
  userId: string,
  merchantNormalized: string,
  categoryId: string,
  subcategoryId: string,
  nowIso: string,
): void {
  if (!merchantNormalized) return;
  const existing = db
    .prepare(
      `SELECT 1 FROM merchant_categories
       WHERE user_id = ? AND merchant_normalized = ?`,
    )
    .get(userId, merchantNormalized);
  if (existing) {
    db.prepare(
      `UPDATE merchant_categories
       SET category_id = ?,
           subcategory_id = ?,
           confirmation_count = 1,
           last_confirmed_at = ?
       WHERE user_id = ? AND merchant_normalized = ?`,
    ).run(categoryId, subcategoryId, nowIso, userId, merchantNormalized);
  } else {
    db.prepare(
      `INSERT INTO merchant_categories
         (user_id, merchant_normalized, category_id, subcategory_id,
          confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).run(userId, merchantNormalized, categoryId, subcategoryId, nowIso);
  }
}
