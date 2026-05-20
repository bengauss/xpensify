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
import tokensRouter from "./routes/tokens.js";
import shortcutsRouter from "./routes/shortcuts.js";
import pendingRouter from "./routes/pending.js";
import merchantsRouter from "./routes/merchants.js";
import historyMarkerRouter from "./routes/historyMarker.js";
import { processRecurringTemplates } from "./jobs/recurring.js";
import { sendDailyReminders, sendWeeklySummaries } from "./jobs/notifications.js";
import { sweepExpiredSessions } from "./jobs/sessions.js";
import { runBackup } from "./jobs/backup.js";
import { csrfMiddleware, noStoreMiddleware } from "./middleware/csrf.js";
import { runMigrations } from "./db/migrate.js";
import { seedCategories } from "./db/seed-categories.js";
import db from "./db/connection.js";
import type { Variables } from "./middleware/auth.js";

// Run idempotent migrations on every boot so deploys never need a manual step.
try {
  runMigrations();
} catch (err) {
  console.error("[migrate] Startup migrations failed:", err);
  process.exit(1);
}

// Sync categories from YAML on every boot so color/name/order changes in
// config/categories.yaml take effect without a manual `npm run seed`.
try {
  seedCategories();
} catch (err) {
  console.error("[seed] Category sync failed:", err);
}

// /api/shortcuts/expense is called by iOS Shortcuts which won't send a matching
// Origin header. Bearer-token auth is the security boundary instead, so the
// CSRF Origin check must skip that prefix specifically.
const csrfExceptShortcuts = (c: import("hono").Context, next: import("hono").Next) => {
  if (c.req.path.startsWith("/api/shortcuts/")) return next();
  return csrfMiddleware(c, next);
};

// Chain .route() calls so Hono RPC can infer the full route tree from AppType
const app = new Hono<{ Variables: Variables }>()
  .use("/api/*", csrfExceptShortcuts)
  .use("/api/*", noStoreMiddleware)
  .get("/api/health", (c) => c.json({ ok: true }))
  .route("/api/auth", auth)
  .route("/api/sync", syncRouter)
  .route("/api/recurring", recurringRouter)
  .route("/api/push", pushRouter)
  .route("/api/categories", categoriesRouter)
  .route("/api/export", exportRouter)
  .route("/api/tokens", tokensRouter)
  .route("/api/shortcuts", shortcutsRouter)
  .route("/api/pending", pendingRouter)
  .route("/api/merchants", merchantsRouter)
  .route("/api/history-marker", historyMarkerRouter)
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

// Hourly reminder push (Europe/Vienna timezone)
cron.schedule(
  "0 * * * *",
  () => {
    try {
      sendDailyReminders();
    } catch (err) {
      console.error("[notifications] Hourly reminder cron failed:", err);
    }
  },
  { timezone: "Europe/Vienna" }
);

// Hourly weekly summary push (Europe/Vienna timezone)
cron.schedule(
  "0 * * * *",
  () => {
    try {
      sendWeeklySummaries();
    } catch (err) {
      console.error("[notifications] Hourly weekly summary cron failed:", err);
    }
  },
  { timezone: "Europe/Vienna" }
);

// Daily SQLite snapshot at 03:30 (after the session sweep, before any AM
// activity). No-op when BACKUP_DIR is unset.
cron.schedule("30 3 * * *", () => {
  runBackup().catch((err) => console.error("[backup] cron failed:", err));
});

export type AppType = typeof app;
