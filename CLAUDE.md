# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

xpensify is an offline-first PWA for household expense tracking. Two users (Alice and Bob) share a dataset across devices. The primary design goal is **speed of expense entry** (<5 seconds). Local-first via IndexedDB with sync-on-use to a server.

## Target Devices

End users run this as an installed PWA in **iOS Safari** on **iPhone 15 Pro Max** and **iPhone 16 Pro**. Optimize UI, gestures, safe-area handling, and performance for those devices only — no need to accommodate desktop, Android, or older iPhones. Mind iOS Safari PWA quirks (cold-start fixed-element bugs, safe-area insets, input-focus zoom, no tap-to-zoom) documented under **Gotchas**.

## Architecture

- **client/** — Preact 10.x + TypeScript SPA. Vite dev server on port 5173, proxies `/api` to server.
- **server/** — Hono 4.x on Node.js, better-sqlite3 for storage, node-cron for scheduled jobs. Runs on port 3000.
- Independent packages — each has its own `package.json`, `tsconfig.json`, and scripts.
- In production, the server also serves the built client (`client/dist`) from the same process. In dev, Vite proxies `/api`.

### Key Patterns

- **Amounts** are stored as integer cents (€32.50 → 3250). Convert on display only.
- **Tailwind CSS v4** — no `tailwind.config.ts` or `postcss.config.js`. All tokens defined in `@theme` block in `client/src/index.css`. Uses `@tailwindcss/vite` plugin. Color utilities: `--color-bg-surface` → class `bg-bg-surface` (NOT `bg-surface`).
- **Hono RPC** for type-safe API calls. Server exports `AppType`, client imports it via `@server/*` path alias (type-only, stripped at compile time). Calls with path params + JSON body (PATCH/DELETE on `/:id`) trip TS overload resolution — cast with `as any` (see `SettingsCategories.tsx`, `RecurringForm.tsx`, `Recurring.tsx`). Annoying but tolerated.
- **Dexie liveQuery** for reactive IndexedDB reads in UI components.
- **Preact Signals** for state management, **preact-iso** for routing. Cross-component signals live in `src/lib/` or `src/sync/`, not a central store — each next to the helper module that owns its semantics:
  - `currentUser` → `lib/auth.ts`; `syncStatus` → `sync/status.ts`
  - `editingExpense` → `lib/editing.ts`; `historyFilter` → `lib/filters.ts`; `analyticsDrilldown` → `lib/analyticsDrilldown.ts`
  - `pendingDirection`, `transitionDone`, `isTransitioning` → `lib/transitions.ts`
  - `authChecked` is a private signal local to `app.tsx`.
- **motion** library (motion.dev) v12 — vanilla JS `animate()` only, NOT the React wrapper. Shared spring presets in `client/src/lib/animations.ts`. TypeScript overloads are finicky:
  - Use `(animate as any)(...)` for function-callback animations and any call that trips the overload resolver.
  - Use explicit keyframe arrays like `{ opacity: [0, 1], x: [-20, 0] }` to pin the starting value — otherwise motion reads `getComputedStyle` at t=0 and inherits whatever the element currently shows.
- **Sync-on-use** — triggers on visibility change, 30s interval, after save, pull-to-refresh (vertical swipe from top of tab), manual "force full sync" button in Settings. Server is clock authority for `updated_at` timestamps.
- **Soft deletes** on expenses (`deleted: 1`) for sync correctness — server returns tombstones in initial sync so client views stay consistent after remote deletes.
- **bcryptjs** (pure JS) — not native bcrypt, to avoid Docker multi-arch issues. Cost factor 12.
- **Lazy-loaded screens** — only `AddScreen` is eager (the default landing). History/Recurring/RecurringForm/Settings/SettingsCategories/Analytics/Login are `lazy()` + `Suspense`. Motion + Dexie are split into their own Rollup chunks.

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
cd server && npm run migrate  # Run schema.sql (idempotent) + ALTER TABLE backfills
cd server && npm run seed     # Seed categories, subcategories, users (skips existing users)
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

### PWA Icons
```bash
npx tsx scripts/generate-icons.ts  # Regenerates 192/512 PWA icons + 180 apple-touch-icon via sharp into client/public/icons/
```

## Path Aliases

- `@/*` → `client/src/*` (in client code)
- `@server/*` → `server/src/*` (type-only imports in client, for Hono RPC)

## Environment Variables

Defined in `.env` (gitignored) and `.env.example`. Loaded by `docker compose` via `env_file`, and by `scripts/import-csv.ts` via manual parser.

- `SESSION_SECRET` — declared but currently unused (sessions are opaque UUIDs in SQLite, not signed tokens).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — **runtime**, used by `web-push` on the server. Push is silently skipped if unset.
- `VITE_VAPID_PUBLIC_KEY` — **build-time**, baked into the client bundle for `pushManager.subscribe()`. Must match `VAPID_PUBLIC_KEY`. Passed as `ARG` in Dockerfile.
- `DB_PATH` — SQLite file path (default `./data/xpensify.db`, `/app/data/xpensify.db` in container).
- `PORT` — server port (default 3000).
- `DOMAIN` — e.g. `your-domain.com`. Used by the CSRF middleware to validate the `Origin` header on mutations. **Unset in dev** — CSRF check is skipped so the Vite proxy works.
- `NODE_ENV=production` — gates static-file serving + the `Secure` flag on session cookies.
- `ALICE_PASSWORD` / `BOB_PASSWORD` — initial seed passwords. If unset, `seed-runner.ts` generates a random UUID and prints it to stdout **once**, only on first seed (existing users are skipped).
- `BACKUP_DIR` — declared but currently unused.

## Design Tokens

All colors, spacing, and typography tokens live in `client/src/index.css` under the `@theme` block. Category colors are defined there too. Do not create a separate Tailwind config file.

## Database

- Server: SQLite via better-sqlite3, WAL mode, foreign keys on. Schema in `server/src/db/schema.sql`, static seed in `seed.sql`.
- Client: IndexedDB via Dexie. Schema in `client/src/db/local.ts`. `sync_status` field is client-only.
- Amounts are INTEGER (cents) in both databases.
- **Dexie `orderBy()` requires indexed fields.** Categories only index `id`. Sort by `sort_order` in JS after `.toArray()`, not via `orderBy("sort_order")`.
- Expense `tags` and `image_url` columns are part of the schema on both ends but not yet surfaced in the UI. The sync route round-trips them; don't remove them.

## API Surface

All mounted under `/api/*`, guarded by `csrfMiddleware` (Origin check) + `noStoreMiddleware` (Cache-Control: no-store). Auth is per-router, not global — `health` and `login` are intentionally unauthenticated.

- `GET  /api/health` — unauthenticated liveness probe.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`.
- `POST /api/sync` — batch upsert + delta fetch. Body is `{ changes, last_sync }`.
- `GET|POST|PATCH|DELETE /api/recurring[/:id]`, `GET /api/recurring/forecast`.
- `POST|DELETE /api/push/subscribe`, `GET|PUT /api/push/preferences`.
- `GET|POST /api/categories`, `PATCH|DELETE /api/categories/:id`, subcategory CRUD on `/api/categories/:id/subcategories` + `/api/categories/subcategories/:id`.
- `GET /api/export` — full CSV dump (all users — the ledger is shared).
- Unknown `/api/*` paths return JSON 404, not the SPA shell. Non-`/api` paths in production fall through to `serveStatic` then to the cached `index.html`.

## Auth & Sessions

- Opaque session UUID in the `xpensify_session` cookie (HttpOnly; SameSite=Lax; Secure in production). 90-day expiry, stored in the `sessions` table.
- Login is rate-limited to 10 attempts per 15 min per IP, in-memory. Bcrypt cost 12 throttles naturally.
- CSRF defense is an Origin header check (`middleware/csrf.ts`). GET/HEAD/OPTIONS are exempt. Missing Origin is rejected. Only active when `DOMAIN` is set.
- Password change in `/api/auth/change-password` **rotates all sessions for the user** — every other device has to sign in again — and returns a fresh cookie for the current tab.
- Client-side: on 401 from `/api/sync`, the engine calls `logout()`, which wipes IndexedDB and hard-reloads to `/login`. This prevents pending expenses from being re-stamped under whoever signs in next on the device.
- Push subscription endpoints are allowlisted to known push-service hosts (FCM, Mozilla, Microsoft, Apple, Windows Notify) to block SSRF — see `isAllowedPushEndpoint` in `server/src/routes/push.ts`.

## Cron Jobs

Schedules wired up in `server/src/index.ts` via `node-cron` (server local time). Job bodies live in `server/src/jobs/`:

- `5 0 * * *` — `processRecurringTemplates()` (`jobs/recurring.ts`) generates any due expenses for active recurring templates (catch-up loop handles missed days). Also runs once on server startup.
- `0 3 * * *` — `sweepExpiredSessions(db)` (`jobs/sessions.ts`) deletes expired session rows. Runs on startup too.
- `0 21 * * *` — `sendDailyReminders()` (`jobs/notifications.ts`) pushes a reminder to users who opted in and have 0 expenses logged today. **Note:** fires at a fixed 21:00; the per-user `daily_reminder_time` pref in the DB is currently not applied.
- `0 9 * * *` — `sendWeeklySummaries()` (`jobs/notifications.ts`) pushes weekly totals to users whose `weekly_summary_day` matches today. `weekly_summary_time` pref is similarly unused. The summary sums all users' non-recurring expenses since the start of the current week — it's a household total, not per-user.

Expired/dead push subscriptions (404 or 410 from the push service) are auto-pruned inside `sendToUser`.

## Routing & Shell

`AuthenticatedShell` in `app.tsx` is a **persistent singleton** wrapping `TabTransitionContainer`. It does NOT remount per route, so the transition-layer DOM and its scroll position survive route changes. Header + BottomNav sit outside the container — only the middle animates.

Bottom-nav tabs (`/`, `/history`, `/recurring`, `/analytics`) use directional slide+crossfade. All other routes (`/settings`, `/settings/categories`, `/recurring/new`, `/recurring/edit/:id`) navigate without transition — `navigateTab` bails early if either endpoint isn't a tab. Use plain `route(...)` from `useLocation()` for non-tab navigation; reserve `navigateTab()` for tab switches only.

`TabTransitionContainer` bypasses preact-iso's `<Router>` — it does its own path → component mapping in `RouteContent`. `useRoute().params` is therefore undefined for some paths; `RecurringForm` guards the access.

## Tab Transitions

`client/src/lib/transitions.ts` + `TabTransitionContainer.tsx`:
- `navigateTab()` creates a fresh `transitionDone` Promise, sets `pendingDirection`, then calls `route()`.
- `TabTransitionContainer` keeps two `.transition-layer` slots, animates outgoing out + incoming in via CSS `transition` on `opacity`/`transform`. On `transitionend` (or a 400ms fallback timer), it resolves `transitionDone` via `completeTransition()`.
- Mid-flight tab taps fast-forward the in-flight animation to its final state rather than stacking.
- **Post-transition entrance animations** (row stagger, category reveal) await `transitionDone.value` via `useEntrance` so per-screen reveals play AFTER the crossfade, not during.
- Inline `transform` on layers is cleared after each transition — a persistent `transform` ancestor would trap `position: fixed` descendants (FAB, edit save bar) inside the layer instead of the viewport.

## Gestures

`client/src/lib/gestures.ts` — touch gestures on `TabTransitionContainer`:
- **Horizontal swipe** → `navigateTab()` to prev/next tab. Skipped when the touch starts inside a horizontally-scrollable descendant (e.g. the trend chart).
- **Vertical pull from scrollTop=0** → pull-to-refresh indicator follows finger with resistance; release past 70px triggers `sync()`.
- Intent is locked in after an initial 12px movement; once `scroll` is chosen the gesture yields to native scroll.

## Entrance animations

`client/src/lib/entrance.ts` — the `useEntrance` hook + `animateRowEntrance(container)` helper power staggered row reveals (History, Recurring, CategorySelector).

Contract:
- JSX marks animatable rows with `data-row`, containing `[data-row-text]` (icon + labels) and optional `[data-row-amount]` (trailing value).
- **Default hidden state is a CSS rule in `index.css`** gated on `[data-row-text]:not([data-revealed])` — NOT an inline JSX style. This is critical (see gotcha below).
- `animateRowEntrance` is idempotent and re-entrant: it skips rows already marked `[data-revealed]`. Call it on data growth (infinite scroll, filter change, late data arrival) to reveal new rows without re-animating old ones.
- Incremental calls (rows appended after the initial entrance) reveal instantly — the full staggered cascade plays only on first fill.
- Dep-change cleanup snaps mid-animation rows to their final visible state so rapid re-renders can't strand rows at partial opacity.

When adding a new list screen: pass deps to `useEntrance` that change when rows appear (e.g. `[visibleCount, searchQuery, data?.length]`).

## Screen Cross-Links

- **Analytics drill-down** (`analyticsDrilldown` signal) — three levels: L1 all categories → L2 subcategories of a category → L3 top notes for a subcategory. The signal is reset in an Analytics unmount effect, so leaving and returning to the tab starts at L1.
- **Analytics → History** via "view in history" button — writes `historyFilter` signal with category/subcategory/month, routes to `/history`. History pre-populates its search box from the filter on mount; clearing the chip clears both.
- **History → Add (edit mode)** via `editingExpense` signal — the detail sheet's "edit" button stashes the expense and routes to `/`. `AddScreen` renders a save/cancel bar fixed above the nav when `editingExpense` is set.
- **Add (category-first flow)** — tapping a subcategory with amount still 0 stores a pending selection, shakes the amount input, and focuses it. Filling the amount and tapping again commits.
- **Add discretionary counter** — only counts `source !== "recurring"` expenses. Median-based outlier guard drops any month over 2× the median of the last 3.

## Sync Protocol

POST `/api/sync` with `{ changes, last_sync }`. Server upserts with server-stamped `updated_at`, returns delta changes since `last_sync`. Initial sync (null `last_sync`) returns all records including tombstones. Last-write-wins conflict resolution based on ISO string comparison of `updated_at`.

Server also returns the **full** categories + subcategories list on every sync. The client reconciles by computing `staleIds = local - server`, `bulkDelete(staleIds)`, then `bulkPut(serverList)`. This way server-side deletes propagate without wiping any in-flight client inserts.

Recurring templates are fetched in a separate `GET /api/recurring` call at the end of `sync()` — failure there is non-fatal and logged.

## Service Worker

`client/src/sw.ts` — Workbox with `skipWaiting()` + `clientsClaim()` for immediate activation on deploy. Precaches the built app shell via `precacheAndRoute(self.__WB_MANIFEST)`. **No runtime caching of `/api/*`** — the offline store is IndexedDB (Dexie), and caching authenticated API responses risks leaking one user's data to the next. A legacy `api-cache` from older builds is explicitly deleted on activate.

`push` event: parses payload JSON and calls `showNotification(title, { body, icon })`. `notificationclick` focuses an existing tab or opens a new one.

Build is wired up through `vite-plugin-pwa` in `strategies: "injectManifest"` mode (`vite.config.ts`) — the plugin compiles `src/sw.ts` and injects the precache manifest at `self.__WB_MANIFEST`. `injectRegister: false` and `manifest: false` because the app registers the SW manually and ships its own `public/manifest.json`. `devOptions.enabled: false` keeps the SW out of the dev server so Vite HMR isn't fighting it.

## Docker Build

Three stages in `Dockerfile`:
1. **client-build** — installs both client and server deps (server needs `python3 make g++` for better-sqlite3 native compile). Server deps are required because `@server/*` type imports must resolve during client `tsc`. `VITE_VAPID_PUBLIC_KEY` must be passed as a build `ARG`.
2. **server-build** — compiles server TypeScript.
3. **runtime** — copies `server/node_modules` from stage 2 and runs `npm prune --omit=dev`. Copies `server/dist`, `client/dist`, and the `.sql` files into `server/dist/db/`. Starts `node server/dist/index.js`.

`docker-compose.yml` mounts `./data:/app/data` for the SQLite file, attaches to the external `web` network (Caddy lives in a sibling stack named `flowdx`, not in this repo).

### Build performance

- Dockerfile header is `# syntax=docker/dockerfile:1.7` so BuildKit cache-mount syntax works. Every `npm ci` uses `--mount=type=cache,target=/root/.npm,sharing=locked` plus `--prefer-offline --no-audit --no-fund`. A `package-lock.json` bump still busts the layer, but npm's on-disk cache survives, so the re-install copies from disk instead of re-downloading from the registry.
- Cold build on the VPS is ~40s; fully cached rebuild is ~1s. The single largest step is client `tsc && vite build` (~16s).
- `rollup-plugin-visualizer` emits `client/dist/bundle-stats.html` (treemap, gzip sizes) on every production build. Manual chunks split `motion` and `dexie` out of the main bundle (see `vite.config.ts`).
- The VPS runs a **weekly Docker prune** via root's crontab: `0 4 * * 0 docker buildx prune -f --keep-storage 5GB && docker image prune -af --filter "until=168h"`, logged to `./data/docker-prune.log`. The original trigger was disk pressure (85% full) from 84 GB of accumulated buildx cache silently slowing overlay2 writes. Don't remove this cron without replacing it — the cache grows unbounded otherwise.

## Gotchas

- **Preact re-renders clobber inline JSX styles** — If JSX sets `style={{ opacity: 0 }}` and then motion imperatively sets `el.style.opacity = "1"`, the NEXT re-render (new data, state change, list growth) re-applies the JSX inline style and hides the element again. For animated reveals, keep the default hidden state in a CSS rule gated on a data-attribute that JS adds (e.g. `[data-revealed]`). Never rely on JSX inline `opacity: 0` as a "until animated" marker — it regresses on every re-render. See [lib/entrance.ts](client/src/lib/entrance.ts) for the reference implementation.
- **Height animations** — for collapse/expand where content height is unknown, measure the old height synchronously in the click handler (before `setState`), capture it in a ref, then in `useLayoutEffect` read the new height and animate via CSS `transition: height` with `overflow: hidden`. See [CategoryBars.tsx](client/src/components/CategoryBars.tsx). Motion's `animate()` on height works too but the measure-before-commit pattern avoids a frame flash.
- **`useLiveQuery` returns `undefined` initially**, not `[]`. Guard accordingly — don't `return null` from components, show a loading skeleton instead.
- **`useLiveQuery` swallows errors** (logs to console). If a Dexie query fails (e.g. `orderBy` on non-indexed field), the result stays `undefined` forever with no visible error.
- **Timestamps**: new expenses use full ISO with real H:M:S for within-day ordering. Backdated expenses use `T12:00:00.000Z`. Imported expenses also use noon.
- **User IDs are UUIDs**: Alice = `00000000-0000-0000-0000-000000000001`, Bob = `...0002`. User display in History maps by UUID, not by name substring.
- **`CREATE TABLE IF NOT EXISTS` doesn't add columns to existing tables.** Schema changes require `ALTER TABLE` on the live DB — add them to `server/src/db/migrate.ts` under `addColumnIfMissing`.
- **Viewport meta** disables zoom (`maximum-scale=1, user-scalable=no`) to prevent iOS Safari zoom on input focus. `viewport-fit=cover` was removed — it caused an iOS PWA cold-start tab-bar-above-home-indicator regression.
- **No shell transform** — `AuthenticatedShell` deliberately does not wrap content in a `transform`-ed ancestor. iOS Safari PWAs mis-measure fixed descendants inside transform'ed ancestors on cold start, leaving the bottom nav floating until the first touch reflow. Apply `max-w-[480px] mx-auto` on fixed children instead.
- **Safe-area bottom padding** — `.safe-pb` is a plain `16px` and `.safe-pb-lg` is `24px`. They are **not** safe-area aware; `BottomNav` handles the home-indicator inset itself via `calc(env(safe-area-inset-bottom, 0px) + 24px)`. Analytics uses a custom `calc(env(safe-area-inset-bottom, 0px) + 72px)` because its bottom card wants tighter breathing room above the nav.
- **Hono RPC param+body calls need `as any`** — e.g. `api.api.categories[":id"].$patch({ param: { id }, json: body } as any)`. The overload resolution fails on routes that take both. Already applied across the codebase; keep doing it.
