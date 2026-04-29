import { Hono } from "hono";
import { createHash } from "crypto";
import db from "../db/connection.js";
import { normalizeMerchant } from "../lib/merchantNormalize.js";

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

const shortcuts = new Hono()
  // POST /expense — Apple Pay shortcut webhook. Authenticated via Bearer token.
  .post("/expense", async (c) => {
    const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or malformed Authorization header" }, 401);
    }
    const plainToken = authHeader.slice("Bearer ".length).trim();
    if (!plainToken) {
      return c.json({ error: "Missing or malformed Authorization header" }, 401);
    }

    const tokenHash = hashToken(plainToken);

    if (isRateLimited(tokenHash)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const tokenRow = db
      .prepare(
        `SELECT id, user_id FROM api_tokens WHERE token_hash = ?`
      )
      .get(tokenHash) as { id: string; user_id: string } | undefined;

    if (!tokenRow) {
      return c.json({ error: "Invalid token" }, 401);
    }

    let body: {
      amount?: unknown;
      merchant?: unknown;
      currency?: unknown;
      timestamp?: unknown;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { amount, merchant, currency, timestamp } = body;

    if (typeof amount !== "number" || !isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT_EUR) {
      return c.json({ error: "amount must be a positive number under 10000" }, 400);
    }
    // Reject more than 2 decimal places of precision
    if (Math.round(amount * 100) !== amount * 100) {
      return c.json({ error: "amount may have at most 2 decimal places" }, 400);
    }
    if (typeof merchant !== "string" || merchant.trim() === "") {
      return c.json({ error: "merchant is required" }, 400);
    }
    if (merchant.length > MAX_MERCHANT_LENGTH) {
      return c.json({ error: `merchant must be ${MAX_MERCHANT_LENGTH} characters or fewer` }, 400);
    }
    if (typeof currency !== "string" || currency !== "EUR") {
      return c.json({ error: "xpensify currently only supports EUR transactions" }, 400);
    }
    if (typeof timestamp !== "string" || isNaN(Date.parse(timestamp))) {
      return c.json({ error: "timestamp must be a valid ISO 8601 string" }, 400);
    }

    const normalized = normalizeMerchant(merchant);
    const note = normalized || merchant.toLowerCase().trim();

    const id = crypto.randomUUID();
    const amountCents = Math.round(amount * 100);
    const nowIso = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO expenses
           (id, user_id, category_id, subcategory_id, amount, note, tags, image_url,
            timestamp, source, recurring_template_id, deleted, status, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, 'apple-pay', NULL, 0, 'pending', ?, ?)`
      ).run(id, tokenRow.user_id, amountCents, note, timestamp, nowIso, nowIso);

      db.prepare(
        `UPDATE api_tokens SET last_used_at = ? WHERE id = ?`
      ).run(nowIso, tokenRow.id);
    })();

    c.header("Cache-Control", "no-store");
    return c.json({ id, status: "pending" }, 200);
  });

export default shortcuts;
