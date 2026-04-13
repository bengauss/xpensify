import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import cron from "node-cron";
import auth from "./routes/auth.js";
import syncRouter from "./routes/sync.js";
import recurringRouter from "./routes/recurring.js";
import pushRouter from "./routes/push.js";
import { processRecurringTemplates } from "./jobs/recurring.js";
import { sendDailyReminders, sendWeeklySummaries } from "./jobs/notifications.js";
import type { Variables } from "./middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

// Auth routes (no auth middleware on login/logout)
app.route("/api/auth", auth);

// Sync routes (auth middleware applied inside the router)
app.route("/api/sync", syncRouter);

// Recurring templates routes (auth middleware applied inside the router)
app.route("/api/recurring", recurringRouter);

// Push notification routes (auth middleware applied inside the router)
app.route("/api/push", pushRouter);

// In production, serve the client build
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "../client/dist" }));
  app.get("*", serveStatic({ root: "../client/dist", path: "index.html" }));
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

// Weekly summary push at Sunday 9 AM
cron.schedule("0 9 * * 0", () => {
  try {
    sendWeeklySummaries();
  } catch (err) {
    console.error("[notifications] Weekly summary cron failed:", err);
  }
});

export type AppType = typeof app;
