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
- **Preact Signals** for state management, **preact-iso** for routing. Cross-component signals (`editingExpense`, `historyFilter`, `syncStatus`, `currentUser`, `pendingDirection`, `transitionDone`, `isTransitioning`) live next to the feature that owns them — no central store.
- **motion** library (motion.dev) v12 — vanilla JS `animate()` only, NOT the React wrapper. Shared spring presets in `client/src/lib/animations.ts`. TypeScript overloads are finicky:
  - Use `(animate as any)(...)` for function-callback animations and any call that trips the overload resolver.
  - Use explicit keyframe arrays like `{ opacity: [0, 1], x: [-20, 0] }` to pin the starting value — otherwise motion reads `getComputedStyle` at t=0 and inherits whatever the element currently shows.
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

The `AuthenticatedShell` in `app.tsx` is a **persistent singleton** wrapping an inner `<Router>`. It does NOT remount per route, so the transition-layer DOM and its scroll position survive route changes.

Routes that aren't bottom-nav tabs (settings, recurring/new, recurring/edit/:id) navigate without transitions.

## Tab Transitions

`client/src/lib/transitions.ts` + `TabTransitionContainer.tsx` — directional slide + crossfade between tabs:
- `navigateTab()` creates a fresh `transitionDone` Promise, sets `pendingDirection`, then calls `route()`.
- `TabTransitionContainer` animates the outgoing layer out + incoming in; on completion calls `completeTransition()` which resolves `transitionDone`.
- Mid-flight tab taps fast-forward the in-flight animation to its final state rather than stacking.
- **Post-transition entrance animations** (row stagger, category reveal) await `transitionDone.value` via `useEntrance` so per-screen reveals play AFTER the crossfade, not during.

## Entrance animations

`client/src/lib/entrance.ts` — the `useEntrance` hook + `animateRowEntrance(container)` helper power staggered row reveals (History, Recurring, CategorySelector).

Contract:
- JSX marks animatable rows with `data-row`, containing `[data-row-text]` (icon + labels) and optional `[data-row-amount]` (trailing value).
- **Default hidden state is a CSS rule in `index.css`** gated on `[data-row-text]:not([data-revealed])` — NOT an inline JSX style. This is critical (see gotcha below).
- `animateRowEntrance` is idempotent and re-entrant: it skips rows already marked `[data-revealed]`. Call it on data growth (infinite scroll, filter change, late data arrival) to reveal new rows without re-animating old ones.
- Dep-change cleanup snaps mid-animation rows to their final visible state so rapid re-renders can't strand rows at partial opacity.

When adding a new list screen: pass deps to `useEntrance` that change when rows appear (e.g. `[visibleCount, searchQuery, data?.length]`).

## Sync Protocol

POST `/api/sync` with `{ changes, last_sync }`. Server upserts with server-stamped `updated_at`, returns delta changes since `last_sync`. Initial sync (null `last_sync`) returns all records. Last-write-wins conflict resolution.

**Sync replaces categories/subcategories entirely** (clear + bulkPut), not upsert. This prevents stale entries from lingering after server-side seed changes.

## Service Worker

`client/src/sw.ts` — Workbox with `skipWaiting()` + `clientsClaim()` for immediate activation on deploy. Precaches app shell, NetworkFirst for GET `/api/*`. Mutations bypass cache.

## Docker Build

Three stages in `Dockerfile`. The client-build stage needs `python3 make g++` (apk) for better-sqlite3 native compilation during server dep install (needed for `@server/*` type resolution). The runtime stage is minimal alpine.

## Gotchas

- **Preact re-renders clobber inline JSX styles** — If JSX sets `style={{ opacity: 0 }}` and then motion imperatively sets `el.style.opacity = "1"`, the NEXT re-render (new data, state change, list growth) re-applies the JSX inline style and hides the element again. For animated reveals, keep the default hidden state in a CSS rule gated on a data-attribute that JS adds (e.g. `[data-revealed]`). Never rely on JSX inline `opacity: 0` as a "until animated" marker — it regresses on every re-render. See [lib/entrance.ts](client/src/lib/entrance.ts) for the reference implementation.
- **Height animations** — for collapse/expand where content height is unknown, measure the old height synchronously in the click handler (before `setState`), capture it in a ref, then in `useLayoutEffect` read the new height and animate via CSS `transition: height` with `overflow: hidden`. See [CategoryBars.tsx](client/src/components/CategoryBars.tsx). Motion's `animate()` on height works too but the measure-before-commit pattern avoids a frame flash.
- **`useLiveQuery` returns `undefined` initially**, not `[]`. Guard accordingly — don't `return null` from components, show a loading skeleton instead.
- **`useLiveQuery` swallows errors** (logs to console). If a Dexie query fails (e.g. `orderBy` on non-indexed field), the result stays `undefined` forever with no visible error.
- **Timestamps**: new expenses use full ISO with real H:M:S for within-day ordering. Backdated expenses use `T12:00:00.000Z`. Imported expenses also use noon.
- **User IDs are UUIDs**: Alice = `00000000-0000-0000-0000-000000000001`, Bob = `...0002`. User display in History maps by UUID, not by name substring.
- **`CREATE TABLE IF NOT EXISTS` doesn't add columns to existing tables.** Schema changes require `ALTER TABLE` on the live DB.
- **Viewport meta** disables zoom (`maximum-scale=1, user-scalable=no`) to prevent iOS Safari zoom on input focus.
- **Safe-area bottom padding** — `.safe-pb` (96px + safe inset) and `.safe-pb-lg` (112px + safe inset) are the defaults for tab screens. Analytics uses an inline `calc(env(safe-area-inset-bottom) + 72px)` for a tighter 16px gap above the tab bar. Prefer the utility classes; only go custom when the screen's bottom element needs a specific breathing distance.
