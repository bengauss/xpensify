import { Hono } from "hono";
import { createHash } from "crypto";
import db from "../db/connection.js";
import { normalizeMerchant } from "../lib/merchantNormalize.js";
import { lookupMerchantMemory, resolveCanonical } from "../lib/merchantMemory.js";
import { categorizeWithFlash, isFlashEnabled } from "../lib/flashCategorize.js";
import { notifyApplePayExpense } from "../jobs/notifications.js";

const MAX_MERCHANT_LENGTH = 200;
const MAX_AMOUNT_EUR = 10000;

// Per-token, per-minute rate limit. Same in-memory pattern as login.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;
const tokenAttempts = new Map<string, { count: number; resetAt: number }>();

// Periodically prune expired rate-limit entries to prevent memory leaks
const tokenAttemptsPruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [tokenHash, entry] of tokenAttempts.entries()) {
    if (entry.resetAt < now) {
      tokenAttempts.delete(tokenHash);
    }
  }
}, 60 * 1000);
if (tokenAttemptsPruneTimer.unref) {
  tokenAttemptsPruneTimer.unref();
}

function isRateLimited(tokenHash: string): boolean {
  const now = Date.now();
  const current = tokenAttempts.get(tokenHash);
  if (!current || current.resetAt < now) {
    tokenAttempts.set(tokenHash, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Tolerant amount parser. Shortcuts' "Amount" magic variable from a Wallet
 * transaction serializes differently across iOS versions and locales:
 *  - "1.23"
 *  - "1,23"        (de-AT decimal comma)
 *  - "€1.23" / "1,23 €"
 *  - "EUR 1.23"
 *  - {"amount":1.23,"currency":"EUR"}
 *  - 1.23          (plain number)
 * Returns the EUR amount as a Number, or null if it can't be salvaged.
 */
function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number" && isFinite(raw)) return raw;
  if (raw && typeof raw === "object") {
    // Shortcuts may pass a Currency dict — try common keys
    const obj = raw as Record<string, unknown>;
    if (typeof obj.amount === "number") return obj.amount;
    if (typeof obj.value === "number") return obj.value;
    if (typeof obj.amount === "string") return parseAmount(obj.amount);
    if (typeof obj.value === "string") return parseAmount(obj.value);
    return null;
  }
  if (typeof raw !== "string") return null;
  // Strip currency symbols / codes / spaces / NBSP, keep digits, comma, dot, minus.
  const cleaned = raw
    .replace(/[ \s]/g, "")
    .replace(/[€$£¥]/g, "")
    .replace(/EUR|USD|GBP|JPY/gi, "");
  if (!cleaned) return null;
  // If both comma and dot present, assume comma is thousands sep (en) → drop it.
  // If only comma, treat it as decimal (de-AT/de-DE).
  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = cleaned.replace(/,/g, ".");
  }
  const n = Number(normalized);
  return isFinite(n) ? n : null;
}

/**
 * Tolerant timestamp parser. Returns an ISO-8601 string, or null if the input
 * can't be turned into a real date. Tries ISO first, then `Date.parse` (which
 * accepts many natural-language strings), then null.
 */
function parseTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  if (!isNaN(ms)) return new Date(ms).toISOString();
  return null;
}

/** Resolve and authenticate a Bearer token from the Authorization header.
 *  Also accepts ?token=… as a query-string fallback for HTTP/GET clients
 *  (iOS Shortcuts' "Get Contents of URL" with a JSON body has a known issue
 *  that causes Cloudflare to reject the request as a generic HTTP 400).
 */
function authenticate(c: import("hono").Context):
  | { ok: true; tokenRow: { id: string; user_id: string }; tokenHash: string }
  | { ok: false; status: 401 | 429; body: { error: string } } {
  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
  let plainToken = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    plainToken = authHeader.slice("Bearer ".length).trim();
  } else {
    const q = c.req.query("token");
    if (typeof q === "string") plainToken = q.trim();
  }
  if (!plainToken) {
    return { ok: false, status: 401, body: { error: "Missing or malformed Authorization" } };
  }
  const tokenHash = hashToken(plainToken);
  if (isRateLimited(tokenHash)) {
    return { ok: false, status: 429, body: { error: "Rate limit exceeded" } };
  }
  const tokenRow = db
    .prepare(`SELECT id, user_id FROM api_tokens WHERE token_hash = ?`)
    .get(tokenHash) as { id: string; user_id: string } | undefined;
  if (!tokenRow) {
    return { ok: false, status: 401, body: { error: "Invalid token" } };
  }
  return { ok: true, tokenRow, tokenHash };
}

interface ExpenseInput {
  amount: unknown;
  merchant: unknown;
  currency: unknown;
  timestamp: unknown;
}

function pickFromDict(d: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== "") return d[k];
  }
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function extractFromDict(d: Record<string, unknown>): ExpenseInput {
  const merchantRaw = pickFromDict(d, "merchant", "Merchant", "merchantName", "MerchantName", "name", "Name");
  let merchant: unknown = merchantRaw;
  if (merchantRaw && typeof merchantRaw === "object") {
    const m = merchantRaw as Record<string, unknown>;
    merchant = m.name ?? m.Name ?? m.merchantName ?? JSON.stringify(merchantRaw);
  }
  return {
    amount: pickFromDict(d, "amount", "Amount", "value", "Value"),
    merchant,
    currency: pickFromDict(d, "currency", "Currency", "currencyCode", "CurrencyCode"),
    timestamp: pickFromDict(d, "date", "Date", "timestamp", "Timestamp", "transactionDate", "TransactionDate"),
  };
}

function ingestExpense(
  c: import("hono").Context,
  tokenRow: { id: string; user_id: string },
  raw: ExpenseInput,
  rawForLog: string,
) {
  const amount = parseAmount(raw.amount);
  if (amount === null || amount <= 0 || amount >= MAX_AMOUNT_EUR) {
    console.warn(`[shortcuts] bad amount ${JSON.stringify(raw.amount)} src=${rawForLog.slice(0, 500)}`);
    return c.json({ error: "amount must be a positive number under 10000" }, 400);
  }
  // Tolerant precision check: floating-point representation of values like
  // 18.40 doesn't multiply cleanly to 1840, so the strict equality form
  // false-rejects perfectly valid Apple Pay amounts. Allow up to 0.001 cents
  // of FP drift before flagging as a >2-decimal-places problem.
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 0.001) {
    console.warn(`[shortcuts] amount precision ${amount} src=${rawForLog.slice(0, 500)}`);
    return c.json({ error: "amount may have at most 2 decimal places" }, 400);
  }

  const merchant =
    typeof raw.merchant === "string" ? raw.merchant : raw.merchant != null ? String(raw.merchant) : "";
  if (merchant.trim() === "") {
    console.warn(`[shortcuts] empty merchant src=${rawForLog.slice(0, 500)}`);
    return c.json({ error: "merchant is required" }, 400);
  }
  if (merchant.length > MAX_MERCHANT_LENGTH) {
    return c.json({ error: `merchant must be ${MAX_MERCHANT_LENGTH} characters or fewer` }, 400);
  }

  const currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  if (currency && currency !== "EUR" && currency !== "€" && currency !== "EURO") {
    console.warn(`[shortcuts] non-EUR currency ${JSON.stringify(raw.currency)}`);
    return c.json({ error: "xpensify currently only supports EUR transactions" }, 400);
  }

  const timestamp = parseTimestamp(raw.timestamp) ?? new Date().toISOString();

  const normalized = normalizeMerchant(merchant);
  // Resolve through any user-defined alias so memory lookup, the stored note,
  // and downstream display all share a single canonical name per merchant.
  const canonical = resolveCanonical(normalized);
  const note = canonical || merchant.toLowerCase().trim();

  const id = crypto.randomUUID();
  const amountCents = Math.round(amount * 100);
  const nowIso = new Date().toISOString();

  // Idempotency: iOS Shortcuts retries on transient network errors and we
  // have no client-side dedupe key. A retry hits with the same (user, amount,
  // normalized merchant, transaction timestamp) tuple — the timestamp comes
  // from Apple Wallet and is deterministic per real transaction, so two
  // legit twin purchases will differ by at least a second. Within a 5-min
  // window we treat an exact match as a retry and short-circuit.
  const existingDupe = db
    .prepare(
      `SELECT id, status, category_id, subcategory_id
       FROM expenses
       WHERE user_id = ? AND amount = ? AND note = ? AND source = 'apple-pay'
         AND timestamp = ?
         AND created_at > datetime('now', '-300 seconds')
       LIMIT 1`,
    )
    .get(tokenRow.user_id, amountCents, note, timestamp) as
    | { id: string; status: string; category_id: string | null; subcategoryId: string | null }
    | undefined;
  if (existingDupe) {
    console.log(
      `[shortcuts] dedupe ${existingDupe.id} amount=${amountCents} raw="${merchant}" merchant="${note}" timestamp=${timestamp}`,
    );
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        id: existingDupe.id,
        status: existingDupe.status,
        auto_saved: existingDupe.status === "confirmed",
        deduped: true,
      },
      200,
    );
  }

  // Merchant memory: 2+ prior confirmations → auto-save; 1 → pending with
  // pre-filled suggestion; 0 → pending with no suggestion (and we kick off a
  // Gemini Flash inference in the background to maybe fill it in shortly).
  const memory = lookupMerchantMemory(note);
  let status: "pending" | "confirmed";
  let autoSaved = 0;
  let categoryId: string | null;
  let subcategoryId: string | null;
  let categoryName: string | null = null;
  let subcategoryName: string | null = null;
  let notificationKind: "auto-saved" | "memory-suggest" | "no-suggest";

  if (memory && memory.confirmation_count >= 2) {
    status = "confirmed";
    autoSaved = 1;
    categoryId = memory.category_id;
    subcategoryId = memory.subcategory_id;
    notificationKind = "auto-saved";
  } else if (memory && memory.confirmation_count === 1) {
    status = "pending";
    categoryId = memory.category_id;
    subcategoryId = memory.subcategory_id;
    notificationKind = "memory-suggest";
  } else {
    status = "pending";
    categoryId = null;
    subcategoryId = null;
    notificationKind = "no-suggest";
  }

  if (categoryId && subcategoryId) {
    const lookup = db
      .prepare(
        `SELECT c.name AS category_name, s.name AS subcategory_name
         FROM categories c JOIN subcategories s ON s.category_id = c.id
         WHERE c.id = ? AND s.id = ?`,
      )
      .get(categoryId, subcategoryId) as
      | { category_name: string; subcategory_name: string }
      | undefined;
    categoryName = lookup?.category_name ?? null;
    subcategoryName = lookup?.subcategory_name ?? null;
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO expenses
         (id, user_id, category_id, subcategory_id, amount, note, tags, image_url,
          timestamp, source, recurring_template_id, deleted, status, auto_saved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'apple-pay', NULL, 0, ?, ?, ?, ?)`,
    ).run(
      id,
      tokenRow.user_id,
      categoryId,
      subcategoryId,
      amountCents,
      note,
      timestamp,
      status,
      autoSaved,
      nowIso,
      nowIso,
    );

    db.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`).run(nowIso, tokenRow.id);
  })();

  console.log(
    `[shortcuts] ${status === "confirmed" ? "auto-saved" : "logged pending"} ${id} amount=${amountCents} raw="${merchant}" merchant="${note}"${
      memory ? ` memory.count=${memory.confirmation_count}` : ""
    }`,
  );

  // Fire-and-forget post-insert work: push notification, plus (in the
  // no-memory case) a Gemini Flash inference that may upgrade the pending
  // row from 'no-suggest' to 'flash-suggest' before the user even opens the
  // app. Errors are logged and never thrown.
  const userId = tokenRow.user_id;
  const captured: PostInsertCaptured = {
    categoryName,
    subcategoryName,
    notificationKind,
    status,
    autoSaved,
  };
  queueMicrotask(() => {
    runPostInsertWork(id, userId, note, amountCents, captured).catch((err) => {
      console.error(`[shortcuts] post-insert work failed for ${id}:`, err);
    });
  });

  c.header("Cache-Control", "no-store");
  if (status === "confirmed") {
    return c.json(
      {
        id,
        status,
        auto_saved: true,
        category: categoryName,
        subcategory: subcategoryName,
      },
      200,
    );
  }
  return c.json(
    {
      id,
      status,
      auto_saved: false,
      suggested_category: categoryName,
      suggested_subcategory: subcategoryName,
    },
    200,
  );
}

interface PostInsertCaptured {
  categoryName: string | null;
  subcategoryName: string | null;
  notificationKind: "auto-saved" | "memory-suggest" | "no-suggest";
  status: "pending" | "confirmed";
  autoSaved: number;
}

/** Look up (category, subcategory) display names by id pair. */
function lookupNames(
  categoryId: string,
  subcategoryId: string,
): { category: string; subcategory: string } | null {
  const row = db
    .prepare(
      `SELECT c.name AS category, s.name AS subcategory
       FROM categories c JOIN subcategories s ON s.category_id = c.id
       WHERE c.id = ? AND s.id = ?`,
    )
    .get(categoryId, subcategoryId) as
    | { category: string; subcategory: string }
    | undefined;
  return row ?? null;
}

/**
 * Post-insert background work: run Flash if eligible (no memory) and fire the
 * push notification. Both are non-blocking from the Shortcut's perspective —
 * the webhook already returned 200 by the time this runs.
 */
async function runPostInsertWork(
  expenseId: string,
  userId: string,
  merchantNormalized: string,
  amountCents: number,
  captured: PostInsertCaptured,
): Promise<void> {
  let kind: "auto-saved" | "memory-suggest" | "flash-suggest" | "no-suggest" =
    captured.notificationKind;
  let categoryName = captured.categoryName;
  let subcategoryName = captured.subcategoryName;

  // Flash only fires on the no-memory path. The auto-save and memory-suggest
  // paths trust the user-trained mapping and never call out to Gemini.
  let resolvedMerchant = merchantNormalized;
  if (kind === "no-suggest" && isFlashEnabled()) {
    const suggestion = await categorizeWithFlash(merchantNormalized, amountCents);
    if (suggestion) {
      // Phase 3 auto-alias: if Flash extracted a canonical brand name with
      // high confidence AND that canonical already lives in merchant memory,
      // collapse this hit onto the existing row. User-trained category wins
      // over Flash's own suggestion. Tightly gated — never invents merchants
      // or aliases low-confidence guesses.
      let usedCategoryId = suggestion.category_id;
      let usedSubcategoryId = suggestion.subcategory_id;
      let aliasCreated = false;
      let upgradedToAutoSave = false;

      if (
        suggestion.canonical_merchant &&
        suggestion.canonical_merchant !== merchantNormalized &&
        suggestion.confidence === "high"
      ) {
        const canonicalMemory = lookupMerchantMemory(suggestion.canonical_merchant);
        if (canonicalMemory) {
          const nowIso = new Date().toISOString();
          db.prepare(
            `INSERT INTO merchant_aliases (alias_normalized, canonical_normalized, created_at)
             VALUES (?, ?, ?)
             ON CONFLICT(alias_normalized) DO NOTHING`,
          ).run(merchantNormalized, suggestion.canonical_merchant, nowIso);
          aliasCreated = true;
          usedCategoryId = canonicalMemory.category_id;
          usedSubcategoryId = canonicalMemory.subcategory_id;
          resolvedMerchant = suggestion.canonical_merchant;
          if (canonicalMemory.confirmation_count >= 2) {
            upgradedToAutoSave = true;
          }
        }
      }

      // Idempotent UPDATE: only writes if the row is still pending and still
      // has no category. Guards against the user manually confirming, the
      // row being deleted, or a second hit auto-saving via newly-inserted
      // memory while Flash was running. When the alias path fires we also
      // rewrite `note` to the canonical name and (when memory count ≥ 2)
      // flip the row to confirmed with auto_saved=1.
      const setStatus = upgradedToAutoSave
        ? `, status = 'confirmed', auto_saved = 1`
        : "";
      const setNote = aliasCreated ? `, note = ?` : "";
      const params: unknown[] = [usedCategoryId, usedSubcategoryId];
      if (aliasCreated) params.push(resolvedMerchant);
      params.push(new Date().toISOString());
      params.push(expenseId);

      const result = db
        .prepare(
          `UPDATE expenses
              SET category_id = ?,
                  subcategory_id = ?
                  ${setNote}
                  ${setStatus},
                  updated_at = ?
            WHERE id = ?
              AND status = 'pending'
              AND deleted = 0
              AND category_id IS NULL`,
        )
        .run(...params);
      if (result.changes === 1) {
        const names = lookupNames(usedCategoryId, usedSubcategoryId);
        if (names) {
          if (upgradedToAutoSave) {
            kind = "auto-saved";
          } else if (aliasCreated) {
            kind = "memory-suggest";
          } else {
            kind = "flash-suggest";
          }
          categoryName = names.category;
          subcategoryName = names.subcategory;
        }
        if (aliasCreated) {
          console.log(
            `[shortcuts] flash auto-alias ${merchantNormalized} → ${resolvedMerchant} (${upgradedToAutoSave ? "auto-saved" : "memory-suggest"}) for ${expenseId}`,
          );
        }
      } else {
        console.log(`[shortcuts] flash result discarded for ${expenseId} (row no longer eligible)`);
      }
    }
  }

  const finalStatus =
    kind === "auto-saved" ? "confirmed" : captured.status;
  const url = finalStatus === "confirmed" ? "/history" : `/?confirm=${expenseId}`;
  const suggestion =
    categoryName && subcategoryName
      ? { category: categoryName, subcategory: subcategoryName }
      : undefined;
  await notifyApplePayExpense(
    userId,
    kind,
    { expenseId, merchant: resolvedMerchant, amountCents, url },
    suggestion,
  );
}

const shortcuts = new Hono()
  // POST /expense — Apple Pay shortcut webhook with JSON body.
  .post("/expense", async (c) => {
    const auth = authenticate(c);
    if (!auth.ok) return c.json(auth.body, auth.status);

    let rawBody: string;
    try {
      rawBody = await c.req.text();
    } catch {
      return c.json({ error: "Could not read request body" }, 400);
    }

    let body: ExpenseInput;
    try {
      body = JSON.parse(rawBody) as ExpenseInput;
    } catch {
      console.warn(`[shortcuts] invalid JSON: ${rawBody.slice(0, 500)}`);
      return c.json({ error: "Invalid JSON" }, 400);
    }

    return ingestExpense(c, auth.tokenRow, body, rawBody);
  })
  // GET /expense — same endpoint as a GET with query parameters. Provided as
  // a workaround for iOS Shortcuts' "Get Contents of URL" + JSON body bug,
  // which causes Cloudflare to reject the request with a generic 400. The
  // GET path takes the same fields as ?amount=&merchant=&currency=&timestamp=
  // (and ?token= for the bearer, since some clients drop Authorization on GET).
  .get("/expense", async (c) => {
    const auth = authenticate(c);
    if (!auth.ok) return c.json(auth.body, auth.status);

    // Diagnostic: log the raw URL exactly as it reached the server so we can
    // tell whether the Shortcut/iOS/Cloudflare mangled multi-word merchant
    // strings via missing URL encoding. Trim token query param if present so
    // the log doesn't leak the bearer.
    const rawUrl = c.req.url.replace(/([?&])token=[^&]*/g, "$1token=REDACTED");
    console.log(`[shortcuts] GET raw url: ${rawUrl.slice(0, 800)}`);

    const q = c.req.query();

    // If `transaction` (or `tx` / `dict`) is present, prefer it: it's the
    // whole Wallet Transaction dictionary serialized to JSON by Shortcuts.
    const dictRaw = q.transaction ?? q.tx ?? q.dict;
    if (typeof dictRaw === "string" && dictRaw.trim() !== "") {
      console.log(`[shortcuts] raw dict: ${dictRaw.slice(0, 1000)}`);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(dictRaw);
      } catch {
        console.warn(`[shortcuts] dict not JSON; raw=${dictRaw.slice(0, 500)}`);
      }
      if (parsed && typeof parsed === "object") {
        return ingestExpense(
          c,
          auth.tokenRow,
          extractFromDict(parsed as Record<string, unknown>),
          `?transaction=${dictRaw.slice(0, 500)}`,
        );
      }
    }

    return ingestExpense(
      c,
      auth.tokenRow,
      {
        amount: q.amount,
        merchant: q.merchant,
        currency: q.currency,
        timestamp: q.timestamp,
      },
      `?${new URLSearchParams(q).toString()}`,
    );
  });

export default shortcuts;
