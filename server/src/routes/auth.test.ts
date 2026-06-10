import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import auth from "./auth.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie } from "../test/db.js";
import { mountRouter, jsonInit } from "../test/app.js";

beforeAll(() => ensureMigrated());

let users: ReturnType<typeof seedTestUsers>;
const app = mountRouter("auth", auth);

beforeEach(() => {
  resetDb();
  users = seedTestUsers();
});

describe("POST /api/auth/login", () => {
  it("returns 200 + session cookie for valid credentials", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: users.userA.password } }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("xpensify_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const body = await res.json() as any;
    expect(body.id).toBe(users.userA.id);
    expect(body.username).toBe("alice");
    expect(body).not.toHaveProperty("password_hash");
  });

  it("creates a session row with correct user_id and future expires_at", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: users.userA.password } }),
    );
    const setCookie = res.headers.get("set-cookie")!;
    const sessionId = /xpensify_session=([^;]+)/.exec(setCookie)![1];

    const row = db
      .prepare(`SELECT user_id, expires_at FROM sessions WHERE id = ?`)
      .get(sessionId) as { user_id: string; expires_at: string };
    expect(row.user_id).toBe(users.userA.id);
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 401 for wrong password", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: "wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for nonexistent user", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "nobody", password: "whatever" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rate-limits after 10 failed attempts from same IP", async () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 10; i++) {
      await app.request(
        "/api/auth/login",
        jsonInit("POST", {
          body: { username: "alice", password: "wrong" },
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    // 11th attempt should be blocked, even with correct password
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", {
        body: { username: "alice", password: users.userA.password },
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(res.status).toBe(429);
  });

  it("clears rate-limit counter on successful login", async () => {
    const ip = "203.0.113.2";
    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await app.request(
        "/api/auth/login",
        jsonInit("POST", { body: { username: "alice", password: "wrong" }, headers: { "x-forwarded-for": ip } }),
      );
    }
    // Successful login
    const ok = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: users.userA.password }, headers: { "x-forwarded-for": ip } }),
    );
    expect(ok.status).toBe(200);

    // Now 10 more failures should be allowed (counter reset)
    for (let i = 0; i < 10; i++) {
      await app.request(
        "/api/auth/login",
        jsonInit("POST", { body: { username: "alice", password: "wrong" }, headers: { "x-forwarded-for": ip } }),
      );
    }
    // 11th still blocked
    const blocked = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: "wrong" }, headers: { "x-forwarded-for": ip } }),
    );
    expect(blocked.status).toBe(429);
  });

  it("still rate-limits when the spoofable X-Forwarded-For prefix rotates (uses proxy-appended rightmost IP)", async () => {
    // Production sits behind Caddy, which APPENDS the real client IP to XFF.
    // An attacker controls the prefix but not the rightmost (proxy-added) entry.
    // Rotating the prefix must not reset the per-IP counter.
    const realIp = "198.51.100.7"; // constant: what the proxy appended
    for (let i = 0; i < 10; i++) {
      await app.request(
        "/api/auth/login",
        jsonInit("POST", {
          body: { username: "alice", password: "wrong" },
          // attacker-controlled spoof prefix changes every request
          headers: { "x-forwarded-for": `10.0.0.${i}, ${realIp}` },
        }),
      );
    }
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", {
        body: { username: "alice", password: users.userA.password },
        headers: { "x-forwarded-for": `10.9.9.9, ${realIp}` },
      }),
    );
    expect(res.status).toBe(429);
  });

  it("per-username backstop blocks sustained guessing even across many distinct IPs", async () => {
    // Distributed attack: every request comes from a fresh source IP, so the
    // per-IP limiter never trips. The IP-independent per-username counter must.
    for (let i = 0; i < 20; i++) {
      const res = await app.request(
        "/api/auth/login",
        jsonInit("POST", {
          body: { username: "bob", password: "wrong" },
          headers: { "x-forwarded-for": `192.0.2.${i}` }, // unique IP each time
        }),
      );
      expect(res.status).toBe(401);
    }
    // Next attempt for the same username is blocked regardless of (new) IP,
    // even with the correct password.
    const blocked = await app.request(
      "/api/auth/login",
      jsonInit("POST", {
        body: { username: "bob", password: users.userB.password },
        headers: { "x-forwarded-for": "192.0.2.250" },
      }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the session row and clears cookie", async () => {
    const sessionId = seedTestSession(users.userA.id);
    const res = await app.request(
      "/api/auth/logout",
      jsonInit("POST", { cookie: `xpensify_session=${sessionId}` }),
    );
    expect(res.status).toBe(200);
    const exists = db.prepare(`SELECT 1 FROM sessions WHERE id = ?`).get(sessionId);
    expect(exists).toBeUndefined();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("succeeds even when no cookie is sent", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user with a valid session", async () => {
    const sessionId = seedTestSession(users.userA.id);
    const res = await app.request("/api/auth/me", {
      headers: { cookie: `xpensify_session=${sessionId}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.username).toBe("alice");
    expect(body).not.toHaveProperty("password_hash");
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/change-password", () => {
  it("rotates password, kills all other sessions, issues fresh cookie", async () => {
    const oldSession = seedTestSession(users.userA.id);
    const otherDeviceSession = seedTestSession(users.userA.id);

    const res = await app.request(
      "/api/auth/change-password",
      jsonInit("POST", {
        cookie: sessionCookie(oldSession),
        body: { current_password: users.userA.password, new_password: "new-strong-password-1" },
      }),
    );
    expect(res.status).toBe(200);

    // Both old sessions should be gone — replaced by a new one
    const oldExists = db.prepare(`SELECT 1 FROM sessions WHERE id = ?`).get(oldSession);
    const otherExists = db.prepare(`SELECT 1 FROM sessions WHERE id = ?`).get(otherDeviceSession);
    expect(oldExists).toBeUndefined();
    expect(otherExists).toBeUndefined();

    // Fresh cookie was issued
    const setCookie = res.headers.get("set-cookie")!;
    const newSessionId = /xpensify_session=([^;]+)/.exec(setCookie)![1];
    expect(newSessionId).toBeTruthy();
    const newRow = db.prepare(`SELECT user_id FROM sessions WHERE id = ?`).get(newSessionId) as { user_id: string };
    expect(newRow.user_id).toBe(users.userA.id);

    // New password works for login
    const login = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: "new-strong-password-1" } }),
    );
    expect(login.status).toBe(200);

    // Old password no longer works
    const oldLogin = await app.request(
      "/api/auth/login",
      jsonInit("POST", { body: { username: "alice", password: users.userA.password } }),
    );
    expect(oldLogin.status).toBe(401);
  });

  it("returns 401 when current_password is wrong, doesn't update hash", async () => {
    const sessionId = seedTestSession(users.userA.id);
    const beforeHash = (db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(users.userA.id) as { password_hash: string }).password_hash;

    const res = await app.request(
      "/api/auth/change-password",
      jsonInit("POST", {
        cookie: sessionCookie(sessionId),
        body: { current_password: "wrong", new_password: "new-strong-password-1" },
      }),
    );
    expect(res.status).toBe(401);

    const afterHash = (db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(users.userA.id) as { password_hash: string }).password_hash;
    expect(afterHash).toBe(beforeHash);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const sessionId = seedTestSession(users.userA.id);
    const res = await app.request(
      "/api/auth/change-password",
      jsonInit("POST", {
        cookie: sessionCookie(sessionId),
        body: { current_password: users.userA.password, new_password: "short" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no session cookie", async () => {
    const res = await app.request(
      "/api/auth/change-password",
      jsonInit("POST", {
        body: { current_password: users.userA.password, new_password: "new-strong-password-1" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const sessionId = seedTestSession(users.userA.id);
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie(sessionId) },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
