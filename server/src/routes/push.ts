import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const push = new Hono<{ Variables: Variables }>()
  // Apply auth to all routes
  .use("*", authMiddleware)
  // POST /subscribe — save a push subscription
  .post("/subscribe", async (c) => {
    const userId = c.get("userId");

    let body: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return c.json({ error: "endpoint, keys.p256dh, and keys.auth are required" }, 400);
    }

    // Upsert: delete existing subscription for this endpoint then re-insert (atomic)
    const upsertSubscription = db.transaction(() => {
      db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, userId, endpoint, keys.p256dh, keys.auth);
    });
    upsertSubscription();

    return c.json({ ok: true }, 201);
  })
  // DELETE /subscribe — remove subscription by endpoint
  .delete("/subscribe", async (c) => {
    const userId = c.get("userId");

    let body: { endpoint?: string };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { endpoint } = body;

    if (!endpoint) {
      return c.json({ error: "endpoint is required" }, 400);
    }

    db.prepare(
      `DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`
    ).run(endpoint, userId);

    return c.json({ ok: true });
  })
  // GET /preferences — return notification preferences for the current user
  .get("/preferences", (c) => {
    const userId = c.get("userId");

    const prefs = db
      .prepare(`SELECT * FROM notification_preferences WHERE user_id = ?`)
      .get(userId) as
      | {
          user_id: string;
          daily_reminder: number;
          daily_reminder_time: string;
          weekly_summary: number;
          weekly_summary_day: number;
          weekly_summary_time: string;
          updated_at: string;
        }
      | undefined;

    if (!prefs) {
      // Return defaults if no row exists yet
      return c.json({
        daily_reminder: 0,
        daily_reminder_time: "21:00",
        weekly_summary: 0,
        weekly_summary_day: 0,
        weekly_summary_time: "09:00",
      });
    }

    return c.json(prefs);
  })
  // PUT /preferences — upsert notification preferences
  .put("/preferences", async (c) => {
    const userId = c.get("userId");

    let body: {
      daily_reminder?: number;
      daily_reminder_time?: string;
      weekly_summary?: number;
      weekly_summary_day?: number;
      weekly_summary_time?: string;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const {
      daily_reminder,
      daily_reminder_time,
      weekly_summary,
      weekly_summary_day,
      weekly_summary_time,
    } = body;

    db.prepare(
      `INSERT INTO notification_preferences
         (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         daily_reminder       = COALESCE(excluded.daily_reminder, daily_reminder),
         daily_reminder_time  = COALESCE(excluded.daily_reminder_time, daily_reminder_time),
         weekly_summary       = COALESCE(excluded.weekly_summary, weekly_summary),
         weekly_summary_day   = COALESCE(excluded.weekly_summary_day, weekly_summary_day),
         weekly_summary_time  = COALESCE(excluded.weekly_summary_time, weekly_summary_time),
         updated_at           = datetime('now')`
    ).run(
      userId,
      daily_reminder ?? 0,
      daily_reminder_time ?? "21:00",
      weekly_summary ?? 0,
      weekly_summary_day ?? 0,
      weekly_summary_time ?? "09:00"
    );

    const updated = db
      .prepare(`SELECT * FROM notification_preferences WHERE user_id = ?`)
      .get(userId);

    return c.json(updated);
  });

export default push;
