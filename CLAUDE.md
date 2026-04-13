# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

xpensify is an offline-first PWA for household expense tracking. Two users (Alice and Bob) share a dataset across devices. The primary design goal is **speed of expense entry** (<5 seconds). Local-first via IndexedDB with sync-on-use to a server.

## Architecture

- **client/** — Preact 10.x + TypeScript SPA. Vite dev server on port 5173, proxies `/api` to server.
- **server/** — Hono 4.x on Node.js, better-sqlite3 for storage. Runs on port 3000.
- Independent packages — each has its own `package.json`, `tsconfig.json`, and scripts.

### Key Patterns

- **Amounts** are stored as integer cents (€32.50 → 3250). Convert on display only.
- **Tailwind CSS v4** — no `tailwind.config.ts` or `postcss.config.js`. All tokens defined in `@theme` block in `client/src/index.css`. Uses `@tailwindcss/vite` plugin. Color utilities: `--color-bg-surface` → class `bg-bg-surface` (NOT `bg-surface`).
- **Hono RPC** for type-safe API calls. Server exports `AppType`, client imports it via `@server/*` path alias (type-only, stripped at compile time).
- **Dexie liveQuery** for reactive IndexedDB reads in UI components.
- **Preact Signals** for state management, **preact-iso** for routing.
- **motion** library (motion.dev) v12 — vanilla JS `animate()` only, NOT the React wrapper. The TypeScript overloads for `animate()` are finicky: use `(animate as any)(...)` for function-callback animations, and cast keyframes for element animations when TS picks the wrong overload. Shared spring presets in `client/src/lib/animations.ts`.
- **Sync-on-use** — triggers on visibility change, 30s interval, after save, manual button. No pull-to-refresh. Server is clock authority for `updated_at` timestamps.
- **Soft deletes** on expenses (`deleted: 1`) for sync correctness.
- **bcryptjs** (pure JS) — not native bcrypt, to avoid Docker multi-arch issues.

## Common Commands

### Client
```bash
cd client && npm run dev      # Dev server with HMR (--host exposes on LAN)
cd client && npm run build    # Production build
cd client && npm run preview  # Preview production build
```

### Server
```bash
cd server && npm run dev      # Dev server with tsx watch
cd server && npm run build    # TypeScript compilation
cd server && npm run start    # Run compiled server
cd server && npm run migrate  # Run schema.sql (idempotent)
cd server && npm run seed     # Seed categories, templates, users
```

### Docker (production)
```bash
docker compose up -d --build  # Build and start
```

### CSV Import
```bash
npx tsx scripts/import-csv.ts --dry-run /path/to/expenses.csv  # Preview
npx tsx scripts/import-csv.ts /path/to/expenses.csv             # Import
# Aliases: baby→charlie, health→medical. Defaults user to "alice".
```

## Path Aliases

- `@/*` → `client/src/*` (in client code)
- `@server/*` → `server/src/*` (type-only imports in client, for Hono RPC)

## Design Tokens

All colors, spacing, and typography tokens live in `client/src/index.css` under the `@theme` block. Category colors are defined there too. Do not create a separate Tailwind config file.

## Database

- Server: SQLite via better-sqlite3, WAL mode, foreign keys on. Schema in `server/src/db/schema.sql`.
- Client: IndexedDB via Dexie. Schema in `client/src/db/local.ts`. `sync_status` field is client-only.
- Amounts are INTEGER (cents) in both databases.
- **Dexie `orderBy()` requires indexed fields.** Categories only index `id`. Sort by `sort_order` in JS after `.toArray()`, not via `orderBy("sort_order")`.

## Routing & Shell

The `AuthenticatedShell` in `app.tsx` is a **persistent singleton** wrapping an inner `<Router>`. It does NOT remount per route. This is critical for:
- Tab transitions (`lib/transitions.ts`) — the `<main>` ref must survive route changes
- `contentEl` signal shares the ref between Shell and BottomNav

Routes that aren't bottom-nav tabs (settings, recurring/new, recurring/edit/:id) navigate without transitions.

## Tab Transitions

`client/src/lib/transitions.ts` — directional slide + crossfade between tabs:
- BottomNav intercepts clicks, animates content out, then calls `route()`
- Shell detects path change and calls `animateIn()`
- CategorySelector's mount reveal awaits `transitionDone` signal before playing

## Sync Protocol

POST `/api/sync` with `{ changes, last_sync }`. Server upserts with server-stamped `updated_at`, returns delta changes since `last_sync`. Initial sync (null `last_sync`) returns all records. Last-write-wins conflict resolution.

**Sync replaces categories/subcategories entirely** (clear + bulkPut), not upsert. This prevents stale entries from lingering after server-side seed changes.

## Service Worker

`client/src/sw.ts` — Workbox with `skipWaiting()` + `clientsClaim()` for immediate activation on deploy. Precaches app shell, NetworkFirst for GET `/api/*`. Mutations bypass cache.

## Docker Build

Three stages in `Dockerfile`. The client-build stage needs `python3 make g++` (apk) for better-sqlite3 native compilation during server dep install (needed for `@server/*` type resolution). The runtime stage is minimal alpine.

## Gotchas

- **`useLiveQuery` returns `undefined` initially**, not `[]`. Guard accordingly — don't `return null` from components, show a loading skeleton instead.
- **`useLiveQuery` swallows errors** (logs to console). If a Dexie query fails (e.g. `orderBy` on non-indexed field), the result stays `undefined` forever with no visible error.
- **Timestamps**: new expenses use full ISO with real H:M:S for within-day ordering. Backdated expenses use `T12:00:00.000Z`. Imported expenses also use noon.
- **User IDs are UUIDs**: Alice = `00000000-0000-0000-0000-000000000001`, Bob = `...0002`. User display in History maps by UUID, not by name substring.
- **`CREATE TABLE IF NOT EXISTS` doesn't add columns to existing tables.** Schema changes require `ALTER TABLE` on the live DB.
- **Viewport meta** disables zoom (`maximum-scale=1, user-scalable=no`) to prevent iOS Safari zoom on input focus.
