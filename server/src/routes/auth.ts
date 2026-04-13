import { Hono } from "hono";
import bcrypt from "bcryptjs";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const auth = new Hono<{ Variables: Variables }>();

const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days in seconds

function buildSessionCookie(sessionId: string, clear = false): string {
  if (clear) {
    return `xpensify_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
  }
  return `xpensify_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

// POST /api/auth/login
auth.post("/login", async (c) => {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string") {
    return c.json({ error: "username and password are required" }, 400);
  }

  const user = db
    .prepare(
      `SELECT id, username, display_name, password_hash, avatar_color FROM users WHERE username = ?`
    )
    .get(username) as
    | { id: string; username: string; display_name: string; password_hash: string; avatar_color: string }
    | undefined;

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).run(sessionId, user.id, expiresAt);

  c.header("Set-Cookie", buildSessionCookie(sessionId));

  return c.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_color: user.avatar_color,
  });
});

// POST /api/auth/logout
auth.post("/logout", async (c) => {
  const cookieHeader = c.req.header("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((s) => {
      const [k, ...v] = s.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const sessionId = cookies["xpensify_session"];

  if (sessionId) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  c.header("Set-Cookie", buildSessionCookie("", true));
  return c.json({ ok: true });
});

// GET /api/auth/me
auth.get("/me", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json(user);
});

export default auth;
