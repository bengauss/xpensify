import { Hono } from "hono";
import { createHash, randomBytes } from "crypto";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const MAX_NAME_LENGTH = 100;

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const tokens = new Hono<{ Variables: Variables }>()
  .use("/*", authMiddleware)
  // GET / — list user's tokens (without hash or plain token)
  .get("/", (c) => {
    const userId = c.get("userId");
    const rows = db
      .prepare(
        `SELECT id, name, created_at, last_used_at
         FROM api_tokens
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(userId) as Array<Omit<TokenRow, "user_id">>;
    return c.json(rows);
  })
  // POST / — generate new token. Plain token is returned ONCE.
  .post("/", async (c) => {
    const userId = c.get("userId");
    let body: { name?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    if (!rawName) {
      return c.json({ error: "name is required" }, 400);
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      return c.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, 400);
    }

    const id = crypto.randomUUID();
    const plain = randomBytes(32).toString("hex"); // 64-char hex
    const hash = hashToken(plain);
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, hash, rawName, createdAt);

    return c.json({ id, name: rawName, created_at: createdAt, token: plain }, 201);
  })
  // DELETE /:id — revoke
  .delete("/:id", (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const result = db
      .prepare(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`)
      .run(id, userId);
    if (result.changes === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

export default tokens;
