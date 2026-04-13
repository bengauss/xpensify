import { Hono } from "hono";
import db from "../db/connection.js";
import { authMiddleware, type Variables } from "../middleware/auth.js";

const exportRouter = new Hono<{ Variables: Variables }>()
  .use("/*", authMiddleware)
  // GET / — export all expenses as CSV
  .get("/", (c) => {
    const rows = db
      .prepare(
        `SELECT
           e.id,
           e.timestamp,
           cat.name as category,
           sub.name as subcategory,
           e.amount as amount_cents,
           e.note,
           e.source,
           u.username as user
         FROM expenses e
         JOIN categories cat ON cat.id = e.category_id
         JOIN subcategories sub ON sub.id = e.subcategory_id
         JOIN users u ON u.id = e.user_id
         WHERE e.deleted = 0
         ORDER BY e.timestamp ASC`
      )
      .all() as {
        id: string;
        timestamp: string;
        category: string;
        subcategory: string;
        amount_cents: number;
        note: string | null;
        source: string;
        user: string;
      }[];

    function escapeCsvField(value: string | null | undefined): string {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const header = "id,timestamp,category,subcategory,amount in EUR,note,source,user\n";
    const body = rows
      .map((row) => {
        const amountEur = (row.amount_cents / 100).toFixed(2);
        return [
          escapeCsvField(row.id),
          escapeCsvField(row.timestamp),
          escapeCsvField(row.category),
          escapeCsvField(row.subcategory),
          amountEur,
          escapeCsvField(row.note),
          escapeCsvField(row.source),
          escapeCsvField(row.user),
        ].join(",");
      })
      .join("\n");

    const csv = header + body;

    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", "attachment; filename=xpensify-export.csv");
    return c.text(csv);
  });

export default exportRouter;
