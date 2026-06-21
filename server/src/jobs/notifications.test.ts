import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { sendDailyReminders, sendWeeklySummaries } from "./notifications.js";
import { db, ensureMigrated, resetDb, seedTestUsers } from "../test/db.js";
import webpush from "web-push";

vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn().mockResolvedValue({}),
    setVapidDetails: vi.fn(),
  },
}));

beforeAll(() => {
  ensureMigrated();
  // Ensure VAPID keys environment variables are set so notification module doesn't skip
  process.env.VAPID_PUBLIC_KEY = "test-pub-key";
  process.env.VAPID_PRIVATE_KEY = "test-priv-key";
});

let userAId: string;
let userBId: string;

beforeEach(() => {
  resetDb();
  const users = seedTestUsers();
  userAId = users.userA.id;
  userBId = users.userB.id;

  // Insert mock push subscriptions for both users
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)`
  ).run("sub-a", userAId, "https://fcm.googleapis.com/demo-a", "p256dh-a", "auth-a");

  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)`
  ).run("sub-b", userBId, "https://fcm.googleapis.com/demo-b", "p256dh-b", "auth-b");

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("sendDailyReminders", () => {
  it("sends reminder at matching hour when user has 0 expenses today", async () => {
    // Seed preferences: daily_reminder = 1, daily_reminder_time = "21:00"
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 1, '21:00', 0, 0, '09:00')`
    ).run(userAId);

    // Set time to May 19, 2026, 21:00:00 Europe/Vienna timezone.
    // In Europe/Vienna (GMT+2 during DST in May), 21:00 local is 19:00 UTC.
    vi.setSystemTime(new Date("2026-05-19T19:00:00Z"));

    sendDailyReminders();

    // Should send daily reminder
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadStr] = (webpush.sendNotification as any).mock.calls[0];
    const payload = JSON.parse(payloadStr);
    expect(payload.title).toBe("xpensify reminder");
  });

  it("does not send reminder at matching hour if user has expenses today", async () => {
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 1, '21:00', 0, 0, '09:00')`
    ).run(userAId);

    // Set time to 21:00 local in Vienna (19:00 UTC)
    vi.setSystemTime(new Date("2026-05-19T19:00:00Z"));

    // Add an expense for today
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, created_at, updated_at)
       VALUES ('exp1', ?, 1500, '2026-05-19T12:00:00.000Z', '2026-05-19T12:00:00.000Z', '2026-05-19T12:00:00.000Z')`
    ).run(userAId);

    sendDailyReminders();

    // Should NOT send daily reminder
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("does not send reminder at non-matching hour", async () => {
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 1, '21:00', 0, 0, '09:00')`
    ).run(userAId);

    // Set time to 22:00 local in Vienna (20:00 UTC)
    vi.setSystemTime(new Date("2026-05-19T20:00:00Z"));

    sendDailyReminders();

    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("sendWeeklySummaries", () => {
  it("sends weekly summary at matching hour/weekday with the combined household total", async () => {
    // Seed preferences: weekly_summary = 1, weekly_summary_day = 2 (Tuesday), weekly_summary_time = "09:00"
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 0, '21:00', 1, 2, '09:00')`
    ).run(userAId);

    // Set time to May 19, 2026 (a Tuesday) at 09:00 Vienna local (07:00 UTC)
    vi.setSystemTime(new Date("2026-05-19T07:00:00Z"));

    // Add userA expense for this week (May 18 is Monday, May 19 is Tuesday)
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('exp-a', ?, 3550, '2026-05-19T08:00:00.000Z', 'manual', '2026-05-19T08:00:00.000Z', '2026-05-19T08:00:00.000Z')`
    ).run(userAId);

    // Add userB expense for this week — the ledger is shared, so this counts too
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('exp-b', ?, 8000, '2026-05-19T08:00:00.000Z', 'manual', '2026-05-19T08:00:00.000Z', '2026-05-19T08:00:00.000Z')`
    ).run(userBId);

    sendWeeklySummaries();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadStr] = (webpush.sendNotification as any).mock.calls[0];
    const payload = JSON.parse(payloadStr);
    expect(payload.title).toBe("Weekly summary");
    // Combined household total: €35.50 (userA) + €80.00 (userB) = €115.50
    expect(payload.body).toContain("€115.50 spent");
  });

  it("sends the same combined total to every opted-in user", async () => {
    // Both users opt in for the same day/time.
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 0, '21:00', 1, 2, '09:00')`
    ).run(userAId);
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 0, '21:00', 1, 2, '09:00')`
    ).run(userBId);

    // Tuesday May 19, 2026, 09:00 Vienna local (07:00 UTC)
    vi.setSystemTime(new Date("2026-05-19T07:00:00Z"));

    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('exp-a', ?, 3550, '2026-05-19T08:00:00.000Z', 'manual', '2026-05-19T08:00:00.000Z', '2026-05-19T08:00:00.000Z')`
    ).run(userAId);
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('exp-b', ?, 8000, '2026-05-19T08:00:00.000Z', 'manual', '2026-05-19T08:00:00.000Z', '2026-05-19T08:00:00.000Z')`
    ).run(userBId);

    sendWeeklySummaries();

    // One push per opted-in user (each user has one subscription), same number.
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const bodies = (webpush.sendNotification as any).mock.calls.map(
      ([, payloadStr]: [unknown, string]) => JSON.parse(payloadStr).body
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("€115.50 spent");
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("excludes recurring expenses and respects the week-start boundary", async () => {
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 0, '21:00', 1, 2, '09:00')`
    ).run(userAId);

    // Tuesday May 19, 2026, 09:00 Vienna local (07:00 UTC); week starts Mon May 18.
    vi.setSystemTime(new Date("2026-05-19T07:00:00Z"));

    // Counts: in-week, non-recurring.
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('in-week', ?, 5000, '2026-05-18T10:00:00.000Z', 'manual', '2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00.000Z')`
    ).run(userAId);
    // Excluded: recurring source.
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('recur', ?, 9900, '2026-05-18T10:00:00.000Z', 'recurring', '2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00.000Z')`
    ).run(userBId);
    // Excluded: before this week's Monday.
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp, source, created_at, updated_at)
       VALUES ('last-week', ?, 4200, '2026-05-17T10:00:00.000Z', 'manual', '2026-05-17T10:00:00.000Z', '2026-05-17T10:00:00.000Z')`
    ).run(userBId);

    sendWeeklySummaries();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadStr] = (webpush.sendNotification as any).mock.calls[0];
    expect(JSON.parse(payloadStr).body).toContain("€50.00 spent");
  });

  it("does not send weekly summary at non-matching weekday or hour", async () => {
    db.prepare(
      `INSERT OR REPLACE INTO notification_preferences (user_id, daily_reminder, daily_reminder_time, weekly_summary, weekly_summary_day, weekly_summary_time)
       VALUES (?, 0, '21:00', 1, 2, '09:00')`
    ).run(userAId);

    // Set time to May 19, 2026 (Tuesday) at 10:00 Vienna local (08:00 UTC) - wrong hour
    vi.setSystemTime(new Date("2026-05-19T08:00:00Z"));
    sendWeeklySummaries();
    expect(webpush.sendNotification).not.toHaveBeenCalled();

    // Set time to May 20, 2026 (Wednesday) at 09:00 Vienna local (07:00 UTC) - wrong day
    vi.setSystemTime(new Date("2026-05-20T07:00:00Z"));
    sendWeeklySummaries();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
