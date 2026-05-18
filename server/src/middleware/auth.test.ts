import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware, type Variables } from "./auth.js";
import { db, ensureMigrated, resetDb, seedTestUsers, seedTestSession, sessionCookie } from "../test/db.js";

beforeAll(() => ensureMigrated());

let userAId: string;

beforeEach(() => {
  resetDb();
  userAId = seedTestUsers().userA.id;
});

const app = new Hono<{ Variables: Variables }>().get("/protected", authMiddleware, (c) => {
  return c.json({ userId: c.get("userId"), user: c.get("user") });
});

describe("authMiddleware", () => {
  it("returns 401 when no cookie is sent", async () => {
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 when cookie has no session id", async () => {
    const res = await app.request("/protected", {
      headers: { cookie: "other_cookie=stuff" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when session id does not exist", async () => {
    const res = await app.request("/protected", {
      headers: { cookie: "xpensify_session=does-not-exist" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 and deletes the row when session has expired", async () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const sessionId = seedTestSession(userAId, expired);
    const res = await app.request("/protected", {
      headers: { cookie: sessionCookie(sessionId) },
    });
    expect(res.status).toBe(401);

    const stillThere = db.prepare(`SELECT 1 FROM sessions WHERE id = ?`).get(sessionId);
    expect(stillThere).toBeUndefined();
  });

  it("populates userId + user on a valid session", async () => {
    const sessionId = seedTestSession(userAId);
    const res = await app.request("/protected", {
      headers: { cookie: sessionCookie(sessionId) },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.userId).toBe(userAId);
    expect(data.user.username).toBe("alice");
  });
});
