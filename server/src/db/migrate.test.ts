import { describe, it, expect, beforeAll } from "vitest";
import db from "./connection.js";
import { normalizeAllTimestamps } from "./migrate.js";
import { ensureMigrated } from "../test/db.js";

describe("db/migrate - normalizeAllTimestamps", () => {
  beforeAll(() => ensureMigrated());

  it("converts legacy space-separated and second-precision ISO strings to standard millisecond-precision UTC ISO-8601 strings", () => {
    const catId = "test-migrate-normalize-cat";

    // Clean up first
    db.prepare("DELETE FROM categories WHERE id = ?").run(catId);

    // Insert using legacy formats
    db.prepare(`
      INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at)
      VALUES (?, 'Test Migrate', 'icon', 'color', 99, '2026-05-19 12:00:00', '2026-05-19T13:00:00')
    `).run(catId);

    // Verify it's inserted exactly as legacy format
    const before = db.prepare("SELECT created_at, updated_at FROM categories WHERE id = ?").get(catId) as { created_at: string; updated_at: string };
    expect(before.created_at).toBe("2026-05-19 12:00:00");
    expect(before.updated_at).toBe("2026-05-19T13:00:00");

    // Run normalization
    normalizeAllTimestamps();

    // Verify it has been converted to millisecond ISO-8601 format
    const after = db.prepare("SELECT created_at, updated_at FROM categories WHERE id = ?").get(catId) as { created_at: string; updated_at: string };
    expect(after.created_at).toBe("2026-05-19T12:00:00.000Z");
    expect(after.updated_at).toBe("2026-05-19T13:00:00.000Z");

    // Clean up
    db.prepare("DELETE FROM categories WHERE id = ?").run(catId);
  });
});
