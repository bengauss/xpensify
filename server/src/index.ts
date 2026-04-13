import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import auth from "./routes/auth.js";
import syncRouter from "./routes/sync.js";
import type { Variables } from "./middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

// Auth routes (no auth middleware on login/logout)
app.route("/api/auth", auth);

// Sync routes (auth middleware applied inside the router)
app.route("/api/sync", syncRouter);

// In production, serve the client build
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "../client/dist" }));
  app.get("*", serveStatic({ root: "../client/dist", path: "index.html" }));
}

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`xpensify server running on port ${port}`);
});

export type AppType = typeof app;
