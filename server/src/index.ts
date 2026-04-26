import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import cron from "node-cron";
import { readFileSync } from "fs";
import { resolve } from "path";
import auth from "./routes/auth.js";
import syncRouter from "./routes/sync.js";
import recurringRouter from "./routes/recurring.js";
import pushRouter from "./routes/push.js";
import categoriesRouter from "./routes/categories.js";
import exportRouter from "./routes/export.js";
import { processRecurringTemplates } from "./jobs/recurring.js";
import { sendDailyReminders, sendWeeklySummaries } from "./jobs/notifications.js";
import { sweepExpiredSessions } from "./jobs/sessions.js";
import { csrfMiddleware, noStoreMiddleware } from "./middleware/csrf.js";
import db from "./db/connection.js";
import type { Variables } from "./middleware/auth.js";

// Chain .route() calls so Hono RPC can infer the full route tree from AppType
const app = new Hono<{ Variables: Variables }>()
  .use("/api/*", csrfMiddleware)
  .use("/api/*", noStoreMiddleware)
  .get("/api/health", (c) => c.json({ ok: true }))
  .route("/api/auth", auth)
  .route("/api/sync", syncRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/push", pushRouter)
  .route("/api/categories", categoriesRouter)
  .route("/api/export", exportRouter)
  // Unknown API routes return JSON 404 (not the SPA shell)
  .all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// In production, serve the client build (not part of the API chain)
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./client/dist" }));
  // Cache the SPA shell once at startup instead of reading from disk per request
  const indexHtml = readFileSync(resolve("./client/dist/index.html"), "utf-8");
  app.get("*", (c) => c.html(indexHtml));
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

  // Clear any expired sessions left from previous runs
  try {
    sweepExpiredSessions(db);
  } catch (err) {
    console.error("[sessions] Startup sweep failed:", err);
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

// Daily cron at 03:00 to sweep expired sessions
cron.schedule("0 3 * * *", () => {
  try {
    sweepExpiredSessions(db);
  } catch (err) {
    console.error("[sessions] Sweep cron failed:", err);
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

// Weekly summary push at 9 PM Vienna time, every day (the job filters by each user's configured day)
cron.schedule(
  "0 21 * * *",
  () => {
    try {
      sendWeeklySummaries();
    } catch (err) {
      console.error("[notifications] Weekly summary cron failed:", err);
    }
  },
  { timezone: "Europe/Vienna" }
);

export type AppType = typeof app;
