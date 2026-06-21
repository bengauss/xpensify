import webpush from "web-push";
import db from "../db/connection.js";

// Set VAPID details once when this module loads (only if keys are present)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:noreply@${process.env.DOMAIN || "xpensify.local"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationPrefsRow {
  user_id: string;
  daily_reminder: number;
  daily_reminder_time: string;
  weekly_summary: number;
  weekly_summary_day: number;
  weekly_summary_time: string;
}

/** Send a push notification to all subscriptions belonging to a user. */
async function sendToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
  }
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("[notifications] VAPID keys not configured — skipping push");
    return;
  }

  const subscriptions = db
    .prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`)
    .all(userId) as PushSubscriptionRow[];

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription is no longer valid — remove it
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
          console.log(`[notifications] Removed expired subscription ${sub.id}`);
        } else {
          console.error(`[notifications] Failed to send to subscription ${sub.id}:`, err);
        }
      }
    })
  );
}

function getViennaToday(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === "year")!.value;
  const month = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Send daily reminders to users who have opted in and have 0 expenses today.
 * Scheduled to run hourly.
 */
export function sendDailyReminders(): void {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    hour: "numeric",
    hour12: false
  }).format(new Date());
  const currentHour = String(hourStr).padStart(2, "0");

  const users = db
    .prepare(
      `SELECT user_id FROM notification_preferences
       WHERE daily_reminder = 1 AND daily_reminder_time LIKE ?`
    )
    .all(`${currentHour}:%`) as Array<{ user_id: string }>;

  const today = getViennaToday();

  for (const { user_id } of users) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM expenses
         WHERE user_id = ? AND deleted = 0
           AND date(timestamp) = ?`
      )
      .get(user_id, today) as { cnt: number };

    if (row.cnt === 0) {
      sendToUser(user_id, {
        title: "xpensify reminder",
        body: "Don't forget to log your expenses today!",
      }).catch((err) =>
        console.error(`[notifications] sendDailyReminders error for ${user_id}:`, err)
      );
    }
  }
}

/**
 * Send weekly summaries to users who have opted in and today matches their
 * configured summary day (0 = Sunday … 6 = Saturday) and configured time.
 * Scheduled to run hourly.
 */
export function sendWeeklySummaries(): void {
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const viennaDateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    weekday: "long"
  }).format(new Date());
  const todayDay = weekdays.indexOf(viennaDateStr);

  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    hour: "numeric",
    hour12: false
  }).format(new Date());
  const currentHour = String(hourStr).padStart(2, "0");

  const users = db
    .prepare(
      `SELECT user_id, weekly_summary_day FROM notification_preferences
       WHERE weekly_summary = 1 AND weekly_summary_day = ? AND weekly_summary_time LIKE ?`
    )
    .all(todayDay, `${currentHour}:%`) as Array<{ user_id: string; weekly_summary_day: number }>;

  // Sum from this week's Monday 00:00 (UTC) through now.
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - daysSinceMonday);
  const weekStart = start.toISOString().split("T")[0];

  // The ledger is shared, so the weekly summary is a household total — every
  // opted-in user sees the same number: the combined non-recurring spend across
  // all users. Compute it once (no user_id filter) rather than per user.
  const { total } = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE deleted = 0
         AND source != 'recurring'
         AND date(timestamp) >= ?`
    )
    .get(weekStart) as { total: number };
  const totalFormatted = (total / 100).toFixed(2);

  for (const { user_id } of users) {
    sendToUser(user_id, {
      title: "Weekly summary",
      body: `€${totalFormatted} spent on discretionary expenses this week.`,
    }).catch((err) =>
      console.error(`[notifications] sendWeeklySummaries error for ${user_id}:`, err)
    );
  }
}

/** Format euro amount for notification text. €12.40, €1.00, etc. */
function formatEur(amountCents: number): string {
  return `€${(amountCents / 100).toFixed(2)}`;
}

interface ApplePayNotificationInput {
  expenseId: string;
  merchant: string;
  amountCents: number;
  /** Path the SW should deep-link to. Pending → `/?confirm=<id>`; auto-saved → `/history`. */
  url: string;
}

interface SuggestionNames {
  category: string;
  subcategory: string;
}

/**
 * Send a push notification for an Apple Pay event. Runs out of band relative
 * to the Shortcut webhook; never throws.
 *
 * Variants:
 *  - `auto-saved`     — memory ≥ 2; row already confirmed.
 *  - `memory-suggest` — memory = 1; row is pending with pre-fill.
 *  - `flash-suggest`  — Flash returned a usable suggestion; row is pending.
 *  - `no-suggest`     — no memory and no Flash result; row is pending.
 */
export async function notifyApplePayExpense(
  userId: string,
  kind: "auto-saved" | "memory-suggest" | "flash-suggest" | "no-suggest",
  input: ApplePayNotificationInput,
  suggestion?: SuggestionNames,
): Promise<void> {
  const amount = formatEur(input.amountCents);
  const merchant = input.merchant;

  let title: string;
  let body: string;

  const label = suggestion ? `${suggestion.category} · ${suggestion.subcategory}` : "";

  if (kind === "auto-saved") {
    if (!suggestion) return; // shouldn't happen; auto-save always has a memory mapping
    title = `auto-saved ${amount}`;
    body = `${merchant} → ${label}`;
  } else if (kind === "memory-suggest") {
    if (!suggestion) return;
    title = `tap to confirm ${amount}`;
    body = `${merchant} → ${label} (suggested)`;
  } else if (kind === "flash-suggest") {
    if (!suggestion) return;
    title = `tap to confirm ${amount}`;
    body = `🤖 ${merchant} → ${label} (suggested)`;
  } else {
    title = `tap to categorize ${amount}`;
    body = merchant;
  }

  await sendToUser(userId, {
    title,
    body,
    tag: `xpensify-expense-${input.expenseId}`,
    url: input.url,
  });
}
