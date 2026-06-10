import { Hono } from "hono";
import bcrypt from "bcryptjs";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days in seconds
const MIN_PASSWORD_LENGTH = 8;

// Simple in-memory per-IP rate limit for login, plus an IP-independent
// per-username backstop so a distributed attack rotating source IPs is still
// bounded (the household has only a handful of usernames).
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_MAX_USERNAME_ATTEMPTS = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const usernameAttempts = new Map<string, { count: number; resetAt: number }>();

// Periodically prune expired rate-limit entries to prevent memory leaks
const loginAttemptsPruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (entry.resetAt < now) {
      loginAttempts.delete(ip);
    }
  }
  for (const [name, entry] of usernameAttempts.entries()) {
    if (entry.resetAt < now) {
      usernameAttempts.delete(name);
    }
  }
}, 15 * 60 * 1000);
if (loginAttemptsPruneTimer.unref) {
  loginAttemptsPruneTimer.unref();
}

function clientIp(header: string | undefined): string {
  if (!header) return "unknown";
  // x-forwarded-for is a comma-separated chain "client, proxy1, proxy2…".
  // We sit behind Caddy, which APPENDS the real client IP, so only the
  // rightmost entry is trustworthy — earlier entries are attacker-controlled
  // and must not be used as the rate-limit key (else a rotating spoofed prefix
  // defeats the limiter). Take the last non-empty entry.
  const parts = header.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : "unknown";
}

function bumpCounter(map: Map<string, { count: number; resetAt: number }>, key: string): void {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    current.count += 1;
  }
}

function counterTripped(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
): boolean {
  const current = map.get(key);
  if (!current) return false;
  if (current.resetAt < Date.now()) {
    map.delete(key);
    return false;
  }
  return current.count >= limit;
}

function registerFailedLogin(ip: string, username?: string): void {
  bumpCounter(loginAttempts, ip);
  if (username) bumpCounter(usernameAttempts, username);
}

function isLoginBlocked(ip: string, username?: string): boolean {
  if (counterTripped(loginAttempts, ip, LOGIN_MAX_ATTEMPTS)) return true;
  if (username && counterTripped(usernameAttempts, username, LOGIN_MAX_USERNAME_ATTEMPTS)) return true;
  return false;
}

// Test-only: clear the in-memory rate-limit state so cases don't bleed into
// each other through the module-level counters.
export function __resetLoginRateLimits(): void {
  loginAttempts.clear();
  usernameAttempts.clear();
}

const isProduction = process.env.NODE_ENV === "production";

function buildSessionCookie(sessionId: string, clear = false): string {
  const secure = isProduction ? "; Secure" : "";
  if (clear) {
    return `xpensify_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  }
  return `xpensify_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

const auth = new Hono<{ Variables: Variables }>()
  // POST /api/auth/login
  .post("/login", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"));

    if (isLoginBlocked(ip)) {
      return c.json({ error: "Too many attempts, try again later" }, 429);
    }

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

    // Re-check with the username in hand: a distributed attack that rotates
    // source IPs is caught by the per-username backstop even when no single IP
    // has tripped its own limit.
    if (isLoginBlocked(ip, username)) {
      return c.json({ error: "Too many attempts, try again later" }, 429);
    }

    const user = db
      .prepare(
        `SELECT id, username, display_name, password_hash, avatar_color FROM users WHERE username = ?`
      )
      .get(username) as
      | { id: string; username: string; display_name: string; password_hash: string; avatar_color: string }
      | undefined;

    if (!user) {
      registerFailedLogin(ip, username);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      registerFailedLogin(ip, username);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Success — clear any accumulated failures for this IP and username
    loginAttempts.delete(ip);
    usernameAttempts.delete(username);

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
  })
  // POST /api/auth/logout
  .post("/logout", async (c) => {
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
  })
  // GET /api/auth/me
  .get("/me", authMiddleware, (c) => {
    const user = c.get("user");
    return c.json(user);
  })
  // POST /api/auth/change-password
  .post("/change-password", authMiddleware, async (c) => {
    let body: { current_password?: unknown; new_password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { current_password, new_password } = body;
    if (typeof current_password !== "string" || typeof new_password !== "string") {
      return c.json({ error: "current_password and new_password are required" }, 400);
    }

    if (new_password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `new_password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
    }

    const userId = c.get("userId");
    const user = db
      .prepare(`SELECT id, password_hash FROM users WHERE id = ?`)
      .get(userId) as { id: string; password_hash: string } | undefined;

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    const newHash = await bcrypt.hash(new_password, 12);

    // Invalidate every existing session for this user, then issue a fresh one
    // for the current tab. Any other logged-in device has to sign in again.
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

    const rotate = db.transaction(() => {
      db.prepare(
        `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`
      ).run(newHash, new Date().toISOString(), userId);
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
      db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
      ).run(sessionId, userId, expiresAt);
    });
    rotate();

    c.header("Set-Cookie", buildSessionCookie(sessionId));

    return c.json({ ok: true });
  });

export default auth;
