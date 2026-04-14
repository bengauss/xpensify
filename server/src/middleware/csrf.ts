import { createMiddleware } from "hono/factory";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Reject mutating requests whose Origin header doesn't match DOMAIN.
 * In dev (DOMAIN unset) the check is skipped so localhost Vite proxy works.
 * GET / HEAD / OPTIONS are never checked.
 */
export const csrfMiddleware = createMiddleware(async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method)) {
    const domain = process.env.DOMAIN;
    if (domain) {
      const origin = c.req.header("origin");
      const expected = `https://${domain}`;
      if (!origin || origin !== expected) {
        return c.json({ error: "Invalid origin" }, 403);
      }
    }
  }
  await next();
});

/**
 * Stamp Cache-Control: no-store on every API response so authenticated JSON
 * isn't cached by browsers or intermediate proxies.
 */
export const noStoreMiddleware = createMiddleware(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
