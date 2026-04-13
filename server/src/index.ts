import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import cron from "node-cron";
import auth from "./routes/auth.js";
import syncRouter from "./routes/sync.js";
import recurringRouter from "./routes/recurring.js";
import pushRouter from "./routes/push.js";
import categoriesRouter from "./routes/categories.js";
import exportRouter from "./routes/export.js";
import { processRecurringTemplates } from "./jobs/recurring.js";
import { sendDailyReminders, sendWeeklySummaries } from "./jobs/notifications.js";
import type { Variables } from "./middleware/auth.js";

// Chain .route() calls so Hono RPC can infer the full route tree from AppType
const app = new Hono<{ Variables: Variables }>()
  .get("/api/health", (c) => c.json({ ok: true }))
  .route("/api/auth", auth)
  .route("/api/sync", syncRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/push", pushRouter)
  .route("/api/categories", categoriesRouter)
  .route("/api/export", exportRouter);

// In production, serve the client build (not part of the API chain)
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "../client/dist" }));
  // SPA fallback: serve index.html for any non-API route
  app.get("*", async (c) => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const html = readFileSync(resolve("../client/dist/index.html"), "utf-8");
    return c.html(html);
  });
}

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`xpensify server running on port ${port}`);

  // Catch up on any missed recurring entries on startup
  try {
    processRecurringTemplates();
  } catch (err) {
    console.error("[recurring] Startup processing failed:", err);
  }
});

// Daily cron at 00:05 to generate recurring expenses
cron.schedule("5 0 * * *", () => {
  try {
    processRecurringTemplates();
  } catch (err) {
    console.error("[recurring] Cron processing failed:", err);
  }
});

// Daily reminder push at 9 PM
cron.schedule("0 21 * * *", () => {
  try {
    sendDailyReminders();
  } catch (err) {
    console.error("[notifications] Daily reminder cron failed:", err);
  }
});

// Weekly summary push at 9 AM every day (the job filters by each user's configured day)
cron.schedule("0 9 * * *", () => {
  try {
    sendWeeklySummaries();
  } catch (err) {
    console.error("[notifications] Weekly summary cron failed:", err);
  }
});

export type AppType = typeof app;
