import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

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
