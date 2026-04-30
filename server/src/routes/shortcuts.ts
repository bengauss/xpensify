import { Hono } from "hono";
import { createHash } from "crypto";
import db from "../db/connection.js";
import { normalizeMerchant } from "../lib/merchantNormalize.js";
import { lookupMerchantMemory } from "../lib/merchantMemory.js";

const MAX_MERCHANT_LENGTH = 200;
const MAX_AMOUNT_EUR = 10000;

// Per-token, per-minute rate limit. Same in-memory pattern as login.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;
const tokenAttempts = new Map<string, { count: number; resetAt: number }>();

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
  if (Math.round(amount * 100) !== amount * 100) {
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
  const note = normalized || merchant.toLowerCase().trim();

  const id = crypto.randomUUID();
  const amountCents = Math.round(amount * 100);
  const nowIso = new Date().toISOString();

  // Merchant memory: 2+ prior confirmations → auto-save; 1 → pending with
  // pre-filled suggestion; 0 → pending with no suggestion.
  const memory = lookupMerchantMemory(tokenRow.user_id, note);
  let status: "pending" | "confirmed";
  let categoryId: string | null;
  let subcategoryId: string | null;
  let categoryName: string | null = null;
  let subcategoryName: string | null = null;

  if (memory && memory.confirmation_count >= 2) {
    status = "confirmed";
    categoryId = memory.category_id;
    subcategoryId = memory.subcategory_id;
  } else if (memory && memory.confirmation_count === 1) {
    status = "pending";
    categoryId = memory.category_id;
    subcategoryId = memory.subcategory_id;
  } else {
    status = "pending";
    categoryId = null;
    subcategoryId = null;
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
          timestamp, source, recurring_template_id, deleted, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'apple-pay', NULL, 0, ?, ?, ?)`,
    ).run(
      id,
      tokenRow.user_id,
      categoryId,
      subcategoryId,
      amountCents,
      note,
      timestamp,
      status,
      nowIso,
      nowIso,
    );

    db.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`).run(nowIso, tokenRow.id);
  })();

  console.log(
    `[shortcuts] ${status === "confirmed" ? "auto-saved" : "logged pending"} ${id} amount=${amountCents} merchant="${note}"${
      memory ? ` memory.count=${memory.confirmation_count}` : ""
    }`,
  );

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

    const q = c.req.query();
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
