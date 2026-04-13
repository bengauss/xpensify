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
- **Tailwind CSS v4** — no `tailwind.config.ts` or `postcss.config.js`. All tokens defined in `@theme` block in `client/src/index.css`. Uses `@tailwindcss/vite` plugin.
- **Hono RPC** for type-safe API calls. Server exports `AppType`, client imports it via `@server/*` path alias (type-only, stripped at compile time).
- **Dexie liveQuery** for reactive IndexedDB reads in UI components.
- **Preact Signals** for state management, **preact-iso** for routing.
- **motion** library (motion.dev) — vanilla JS `animate()` only, NOT the React wrapper. Shared spring presets in `client/src/lib/animations.ts`.
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
docker compose up -d --build  # Build and start (app + Caddy)
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

## Sync Protocol

POST `/api/sync` with `{ changes, last_sync }`. Server upserts with server-stamped `updated_at`, returns delta changes since `last_sync`. Initial sync (null `last_sync`) returns all records. Last-write-wins conflict resolution.
