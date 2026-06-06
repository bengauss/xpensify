import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

interface RecurringTemplateRow {
  id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  day_of_month: number | null;
  start_date: string | null;
  active: number;
  next_due: string;
  created_at: string;
  updated_at: string;
  // joined
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  subcategory_name?: string;
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Compute next_due from frequency, optional day_of_month, and optional start_date (yearly) */
function computeNextDue(
  frequency: "weekly" | "monthly" | "yearly",
  dayOfMonth: number | null,
  startDate: string | null
): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const todayDay = today.getDate();
  const todayKey = ymd(year, month, todayDay);

  if (frequency === "monthly") {
    const dom = dayOfMonth ?? todayDay;
    // If the day this month is still in the future (or today), use it; else next month
    if (dom >= todayDay) {
      const maxDay = new Date(year, month, 0).getDate();
      const clampedDay = Math.min(dom, maxDay);
      return ymd(year, month, clampedDay);
    } else {
      let newMonth = month + 1;
      let newYear = year;
      if (newMonth > 12) { newMonth = 1; newYear += 1; }
      const maxDay = new Date(newYear, newMonth, 0).getDate();
      const clampedDay = Math.min(dom, maxDay);
      return ymd(newYear, newMonth, clampedDay);
    }
  } else if (frequency === "weekly") {
    // Next week from today
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  } else {
    // yearly — use start_date to anchor month/day; if start_date is today or future, use it directly
    if (startDate) {
      if (startDate >= todayKey) return startDate;
      const [, sm, sd] = startDate.split("-").map(Number);
      const anniversaryThisYear = ymd(year, sm, Math.min(sd, new Date(year, sm, 0).getDate()));
      if (anniversaryThisYear >= todayKey) return anniversaryThisYear;
      const maxDay = new Date(year + 1, sm, 0).getDate();
      return ymd(year + 1, sm, Math.min(sd, maxDay));
    }
    // Fallback: legacy behavior — same month/day next year
    const dom = dayOfMonth ?? todayDay;
    const maxDay = new Date(year + 1, month, 0).getDate();
    const clampedDay = Math.min(dom, maxDay);
    return ymd(year + 1, month, clampedDay);
  }
}

const recurring = new Hono<{ Variables: Variables }>()
  // Apply auth to all routes
  .use("*", authMiddleware)
  // GET / — list all household recurring templates with joined names.
  // Templates are household-shared (like expense history), so no user_id filter.
  .get("/", (c) => {
    const templates = db
      .prepare(
        `SELECT rt.*,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                s.name AS subcategory_name
         FROM recurring_templates rt
         LEFT JOIN categories c ON c.id = rt.category_id
         LEFT JOIN subcategories s ON s.id = rt.subcategory_id
         ORDER BY rt.amount DESC`
      )
      .all() as RecurringTemplateRow[];

    return c.json(templates);
  })
  // GET /forecast — remaining household recurring expenses for the current month
  .get("/forecast", (c) => {
    // Active templates with next_due in current month (household-shared, no user_id filter)
    const upcoming = db
      .prepare(
        `SELECT rt.id, rt.amount, rt.note, rt.next_due, rt.frequency,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                s.name AS subcategory_name
         FROM recurring_templates rt
         LEFT JOIN categories c ON c.id = rt.category_id
         LEFT JOIN subcategories s ON s.id = rt.subcategory_id
         WHERE rt.active = 1
           AND strftime('%Y-%m', rt.next_due) = strftime('%Y-%m', 'now')`
      )
      .all() as Array<{
        id: string;
        amount: number;
        note: string | null;
        next_due: string;
        frequency: string;
        category_name: string;
        category_icon: string;
        category_color: string;
        subcategory_name: string;
      }>;

    // Already-generated this month — counted household-wide regardless of which
    // user the generated expense was stamped under.
    const generated = db
      .prepare(
        `SELECT recurring_template_id, timestamp
         FROM expenses
         WHERE source = 'recurring'
           AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
           AND deleted = 0`
      )
      .all() as Array<{ recurring_template_id: string; timestamp: string }>;

    const generatedSet = new Set(generated.map((g) => g.recurring_template_id));

    const totalRemaining = upcoming
      .filter((t) => !generatedSet.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0);

    return c.json({
      total_remaining: totalRemaining,
      upcoming_count: upcoming.filter((t) => !generatedSet.has(t.id)).length,
      total_count: upcoming.length,
      items: upcoming.map((t) => ({
        ...t,
        already_generated: generatedSet.has(t.id),
      })),
    });
  })
  // POST / — create new template
  .post("/", async (c) => {
    const userId = c.get("userId");
    let body: {
      category_id?: string;
      subcategory_id?: string;
      amount?: number;
      note?: string | null;
      frequency?: "weekly" | "monthly" | "yearly";
      day_of_month?: number | null;
      start_date?: string | null;
      active?: number;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { category_id, subcategory_id, amount, frequency, day_of_month, start_date, note, active } = body;

    if (!category_id || !subcategory_id || amount == null || !frequency) {
      return c.json({ error: "category_id, subcategory_id, amount, and frequency are required" }, 400);
    }

    if (!["weekly", "monthly", "yearly"].includes(frequency)) {
      return c.json({ error: "frequency must be weekly, monthly, or yearly" }, 400);
    }

    const startDate = frequency === "yearly" ? (start_date ?? null) : null;
    const id = crypto.randomUUID();
    const nextDue = computeNextDue(frequency, day_of_month ?? null, startDate);

    db.prepare(
      `INSERT INTO recurring_templates
         (id, user_id, category_id, subcategory_id, amount, note, frequency, day_of_month, start_date, active, next_due)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      category_id,
      subcategory_id,
      amount,
      note ?? null,
      frequency,
      day_of_month ?? null,
      startDate,
      active ?? 1,
      nextDue
    );

    const created = db
      .prepare(
        `SELECT rt.*,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                s.name AS subcategory_name
         FROM recurring_templates rt
         LEFT JOIN categories c ON c.id = rt.category_id
         LEFT JOIN subcategories s ON s.id = rt.subcategory_id
         WHERE rt.id = ?`
      )
      .get(id);

    return c.json(created, 201);
  })
  // PATCH /:id — update template fields. Household-shared: any member can edit.
  .patch("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = db
      .prepare(`SELECT * FROM recurring_templates WHERE id = ?`)
      .get(id) as RecurringTemplateRow | undefined;

    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }

    let body: Partial<{
      category_id: string;
      subcategory_id: string;
      amount: number;
      note: string | null;
      frequency: "weekly" | "monthly" | "yearly";
      day_of_month: number | null;
      start_date: string | null;
      active: number;
      next_due: string;
    }>;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.category_id !== undefined) { fields.push("category_id = ?"); values.push(body.category_id); }
    if (body.subcategory_id !== undefined) { fields.push("subcategory_id = ?"); values.push(body.subcategory_id); }
    if (body.amount !== undefined) { fields.push("amount = ?"); values.push(body.amount); }
    if (body.note !== undefined) { fields.push("note = ?"); values.push(body.note); }
    if (body.frequency !== undefined) { fields.push("frequency = ?"); values.push(body.frequency); }
    if (body.day_of_month !== undefined) { fields.push("day_of_month = ?"); values.push(body.day_of_month); }
    if (body.start_date !== undefined) { fields.push("start_date = ?"); values.push(body.start_date); }
    if (body.active !== undefined) { fields.push("active = ?"); values.push(body.active); }
    if (body.next_due !== undefined) { fields.push("next_due = ?"); values.push(body.next_due); }

    // Recompute next_due when schedule inputs change and next_due wasn't explicitly provided
    if (body.next_due === undefined && (body.frequency !== undefined || body.day_of_month !== undefined || body.start_date !== undefined)) {
      const freq = body.frequency ?? existing.frequency;
      const dom = body.day_of_month !== undefined ? body.day_of_month : existing.day_of_month;
      const sd = body.start_date !== undefined ? body.start_date : existing.start_date;
      const nextDue = computeNextDue(freq, dom, freq === "yearly" ? sd : null);
      fields.push("next_due = ?");
      values.push(nextDue);
    }

    if (fields.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(
      `UPDATE recurring_templates SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values);

    const updated = db
      .prepare(
        `SELECT rt.*,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                s.name AS subcategory_name
         FROM recurring_templates rt
         LEFT JOIN categories c ON c.id = rt.category_id
         LEFT JOIN subcategories s ON s.id = rt.subcategory_id
         WHERE rt.id = ?`
      )
      .get(id);

    return c.json(updated);
  })
  // DELETE /:id — household-shared: any member can delete.
  .delete("/:id", (c) => {
    const id = c.req.param("id");

    const existing = db
      .prepare(`SELECT id FROM recurring_templates WHERE id = ?`)
      .get(id);

    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }

    db.prepare(`DELETE FROM recurring_templates WHERE id = ?`).run(id);

    return c.json({ ok: true });
  });

export default recurring;
