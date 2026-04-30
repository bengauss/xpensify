import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import { csrfMiddleware, noStoreMiddleware } from "./csrf.js";

const original = process.env.DOMAIN;

afterEach(() => {
  if (original === undefined) delete process.env.DOMAIN;
  else process.env.DOMAIN = original;
});

function buildApp() {
  return new Hono()
    .use("/*", csrfMiddleware)
    .post("/p", (c) => c.json({ ok: true }))
    .get("/g", (c) => c.json({ ok: true }))
    .delete("/d", (c) => c.json({ ok: true }));
}

describe("csrfMiddleware — DOMAIN unset (dev)", () => {
  it("lets POST through with no Origin header", async () => {
    delete process.env.DOMAIN;
    const res = await buildApp().request("/p", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("csrfMiddleware — DOMAIN set", () => {
  it("rejects POST with no Origin header", async () => {
    process.env.DOMAIN = "xpensify.example.com";
    const res = await buildApp().request("/p", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("rejects POST with mismatched Origin", async () => {
    process.env.DOMAIN = "xpensify.example.com";
    const res = await buildApp().request("/p", {
      method: "POST",
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts POST with matching Origin", async () => {
    process.env.DOMAIN = "xpensify.example.com";
    const res = await buildApp().request("/p", {
      method: "POST",
      headers: { origin: "https://xpensify.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("accepts DELETE with matching Origin", async () => {
    process.env.DOMAIN = "xpensify.example.com";
    const res = await buildApp().request("/d", {
      method: "DELETE",
      headers: { origin: "https://xpensify.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("does NOT check Origin on GET", async () => {
    process.env.DOMAIN = "xpensify.example.com";
    const res = await buildApp().request("/g", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

describe("noStoreMiddleware", () => {
  it("stamps Cache-Control: no-store on every response", async () => {
    const app = new Hono().use("/*", noStoreMiddleware).get("/x", (c) => c.json({ ok: true }));
    const res = await app.request("/x");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
