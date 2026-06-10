/**
 * Vitest global setup. Runs once per test file (vitest forks per file), before
 * any test modules import from the server source tree.
 *
 * Sets DB_PATH=:memory: so the singleton db in src/db/connection.ts opens an
 * in-memory SQLite database. Each test file has its own connection (its own
 * isolated in-memory DB). Within a file, tests share the connection — the
 * resetDb() helper in test/db.ts truncates between tests.
 */

process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test";
// Pin a non-UTC, east-of-UTC timezone so local-time date bugs (e.g. the weekly
// recurring advance off-by-one) surface here instead of hiding on a UTC CI box.
process.env.TZ = "Europe/Vienna";
// Clear DOMAIN so the CSRF middleware lets POST/PUT/PATCH/DELETE through
// without an Origin header.
delete process.env.DOMAIN;
