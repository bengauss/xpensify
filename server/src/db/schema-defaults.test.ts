import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "../test/db.js";
import { ensureMigrated, resetDb, seedTestUsers } from "../test/db.js";

// F9: schema column DEFAULTs must emit full ISO 8601 (T + ms + Z) so that
// omitted-column inserts sort lexically the same way as write paths that stamp
// `new Date().toISOString()`. A `datetime('now')` default (space-separated, no
// ms, no Z) always sorts BEFORE an ISO string at the same instant, which
// corrupts last-write-wins and the Apple Pay dedup window.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("schema timestamp defaults (F9)", () => {
  beforeAll(() => ensureMigrated());
  beforeEach(() => resetDb());

  it("categories default created_at/updated_at to ISO 8601", () => {
    db.prepare(
      `INSERT INTO categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
    ).run("cat-iso", "ISO Test", "icon", "#fff", 99);
    const row = db
      .prepare(`SELECT created_at, updated_at FROM categories WHERE id = ?`)
      .get("cat-iso") as { created_at: string; updated_at: string };
    expect(row.created_at).toMatch(ISO_RE);
    expect(row.updated_at).toMatch(ISO_RE);
  });

  it("expenses default created_at/updated_at to ISO 8601", () => {
    const { userA } = seedTestUsers();
    db.prepare(
      `INSERT INTO expenses (id, user_id, amount, timestamp) VALUES (?, ?, ?, ?)`,
    ).run("exp-iso", userA.id, 100, new Date().toISOString());
    const row = db
      .prepare(`SELECT created_at, updated_at FROM expenses WHERE id = ?`)
      .get("exp-iso") as { created_at: string; updated_at: string };
    expect(row.created_at).toMatch(ISO_RE);
    expect(row.updated_at).toMatch(ISO_RE);
  });

  it("sessions default created_at to ISO 8601", () => {
    const { userA } = seedTestUsers();
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    ).run("sess-iso", userA.id, new Date(Date.now() + 1000).toISOString());
    const row = db
      .prepare(`SELECT created_at FROM sessions WHERE id = ?`)
      .get("sess-iso") as { created_at: string };
    expect(row.created_at).toMatch(ISO_RE);
  });

  it("a default-stamped row sorts lexically against a later ISO write-path value", () => {
    db.prepare(
      `INSERT INTO categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
    ).run("cat-sort", "Sort Test", "icon", "#fff", 1);
    const { created_at } = db
      .prepare(`SELECT created_at FROM categories WHERE id = ?`)
      .get("cat-sort") as { created_at: string };
    // A timestamp generated "after" the insert must be lexically greater.
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(created_at < later).toBe(true);
  });
});
