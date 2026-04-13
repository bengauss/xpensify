import db from "../db/connection.js";

interface RecurringTemplate {
  id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string;
  amount: number;
  note: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  day_of_month: number | null;
  active: number;
  next_due: string;
}

function advanceDate(current: string, frequency: "weekly" | "monthly" | "yearly"): string {
  const [year, month, day] = current.split("-").map(Number);

  if (frequency === "weekly") {
    const d = new Date(year, month - 1, day + 7);
    return d.toISOString().split("T")[0];
  } else if (frequency === "monthly") {
    // Same day next month; clamp to last day if needed
    let newMonth = month; // stays in 1-12 space after adding
    let newYear = year;
    newMonth += 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const maxDay = new Date(newYear, newMonth, 0).getDate(); // last day of newMonth
    const clampedDay = Math.min(day, maxDay);
    return `${String(newYear).padStart(4, "0")}-${String(newMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
  } else {
    // yearly
    let newYear = year + 1;
    // handle leap year edge case (Feb 29 → Feb 28)
    const maxDay = new Date(newYear, month, 0).getDate();
    const clampedDay = Math.min(day, maxDay);
    return `${String(newYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
  }
}

export function processRecurringTemplates(): void {
  const today = (db.prepare("SELECT date('now') as today").get() as { today: string }).today;

  const templates = db
    .prepare(
      `SELECT * FROM recurring_templates WHERE active = 1 AND next_due <= ?`
    )
    .all(today) as RecurringTemplate[];

  if (templates.length === 0) return;

  const checkDuplicate = db.prepare<[string, string]>(
    `SELECT 1 FROM expenses WHERE recurring_template_id = ? AND timestamp = ?`
  );

  const insertExpense = db.prepare<[string, string, string, string, number, string | null, string, string]>(
    `INSERT INTO expenses
       (id, user_id, category_id, subcategory_id, amount, note, timestamp, source, recurring_template_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'recurring', ?)`
  );

  const updateNextDue = db.prepare<[string, string]>(
    `UPDATE recurring_templates SET next_due = ?, updated_at = datetime('now') WHERE id = ?`
  );

  const process = db.transaction(() => {
    for (const template of templates) {
      let nextDue = template.next_due;

      // Catch-up loop: generate all missed entries while next_due <= today
      while (nextDue <= today) {
        const timestamp = `${nextDue}T12:00:00.000Z`;

        // Idempotency check
        const exists = checkDuplicate.get(template.id, timestamp);
        if (!exists) {
          insertExpense.run(
            crypto.randomUUID(),
            template.user_id,
            template.category_id,
            template.subcategory_id,
            template.amount,
            template.note ?? null,
            timestamp,
            template.id
          );
        }

        nextDue = advanceDate(nextDue, template.frequency);
      }

      // Persist the advanced next_due
      updateNextDue.run(nextDue, template.id);
    }
  });

  try {
    process();
    console.log(`[recurring] Processed ${templates.length} template(s).`);
  } catch (err) {
    console.error("[recurring] Error processing recurring templates:", err);
  }
}
