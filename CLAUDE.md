# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

xpensify is an offline-first PWA for household expense tracking. Two-to-four users share a dataset across devices. The primary design goal is **speed of expense entry** (<5 seconds). Local-first via IndexedDB with sync-on-use to a server.

## Target Devices

End users run this as an installed PWA in **iOS Safari** on **iPhone 15 Pro Max** and **iPhone 16 Pro**. Optimize UI, gestures, safe-area handling, and performance for those devices only — no need to accommodate desktop, Android, or older iPhones. Mind iOS Safari PWA quirks (cold-start fixed-element bugs, safe-area insets, input-focus zoom, no tap-to-zoom) documented under **Gotchas**.

## Architecture

- **client/** — Preact 10.x + TypeScript SPA. Vite dev server on port 5173, proxies `/api` to server.
- **server/** — Hono 4.x on Node.js, better-sqlite3 for storage, node-cron for scheduled jobs. Runs on port 3000.
- Independent packages — each has its own `package.json`, `tsconfig.json`, and scripts. A root `tsconfig.json` covers `scripts/` for IDE type-checking (resolves types from `server/node_modules`).
- In production, the server also serves the built client (`client/dist`) from the same process. In dev, Vite proxies `/api`.

### Key Patterns

- **Amounts** are stored as integer cents (€32.50 → 3250). Convert on display only.
- **Tailwind CSS v4** — no `tailwind.config.ts` or `postcss.config.js`. All tokens defined in `@theme` block in `client/src/index.css`. Uses `@tailwindcss/vite` plugin. Color utilities: `--color-bg-surface` → class `bg-bg-surface` (NOT `bg-surface`).
- **Hono RPC** for type-safe API calls. Server exports `AppType`, client imports it via `@server/*` path alias (type-only, stripped at compile time). Calls with path params + JSON body (PATCH/DELETE on `/:id`) trip TS overload resolution — cast with `as any` (see `SettingsCategories.tsx`, `RecurringForm.tsx`, `Recurring.tsx`). Annoying but tolerated.
- **Dexie liveQuery** for reactive IndexedDB reads in UI components.
- **Preact Signals** for state management, **preact-iso** for routing. Cross-component signals live in `src/lib/` or `src/sync/`, not a central store — each next to the helper module that owns its semantics:
  - `currentUser`, `isSessionExpired` → `lib/auth.ts`; `syncStatus` → `sync/status.ts`
  - `categoriesSignal`, `subcategoriesSignal` → `lib/categories.ts`
  - `editingExpense` → `lib/editing.ts`; `historyFilter` → `lib/filters.ts`; `analyticsDrilldown` → `lib/analyticsDrilldown.ts`
  - `pendingDirection`, `transitionDone`, `isTransitioning` → `lib/transitions.ts`
  - `pendingExpenses`, `confirmingPending`, `hasUnreviewedAutoSaves` → `lib/pending.ts` (Apple Pay)
  - `authChecked` is a private signal local to `app.tsx`.
- **motion** library (motion.dev) v12 — vanilla JS `animate()` only, NOT the React wrapper. Shared spring presets in `client/src/lib/animations.ts`. TypeScript overloads are finicky:
  - Use `(animate as any)(...)` for function-callback animations and any call that trips the overload resolver.
  - Use explicit keyframe arrays like `{ opacity: [0, 1], x: [-20, 0] }` to pin the starting value — otherwise motion reads `getComputedStyle` at t=0 and inherits whatever the element currently shows.
- **Sync-on-use** — triggers on visibility change, 30s interval, after save, pull-to-refresh (vertical swipe from top of tab), manual "force full sync" button in Settings. Server is clock authority for `updated_at` timestamps.
- **Soft deletes** on expenses (`deleted: 1`) for sync correctness — server returns tombstones in initial sync so client views stay consistent after remote deletes.
- **bcryptjs** (pure JS) — not native bcrypt, to avoid Docker multi-arch issues. Cost factor 12.
- **Lazy-loaded screens** — only `AddScreen` is eager (the default landing). History, Recurring, RecurringForm, Settings, SettingsCategories, SettingsMerchants, Analytics, Confirm, Login are `lazy()` + `Suspense`. Motion + Dexie are split into their own Rollup chunks.

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

### Tests (Vitest)
```bash
cd server && npm test          # 180 tests, ~4s
cd client && npm test          # 65 tests, ~5s
cd <pkg>  && npm run test:watch        # watch mode
cd <pkg>  && npm run test:coverage     # v8 coverage HTML in coverage/
```

### Docker (production)
```bash
docker compose up -d --build  # Build and start
```

### CSV Import
```bash
npx tsx scripts/import-csv.ts --dry-run /path/to/expenses.csv  # Preview
npx tsx scripts/import-csv.ts /path/to/expenses.csv             # Import
# Default user (when CSV row has no `user` column): DEFAULT_IMPORT_USER env var,
# else the alphabetically first user in the DB.
# Pass --legacy-aliases for the deployer-specific baby→charlie / health→medical
# normalization + post-import category renames (off by default).
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
- `VITE_APPLE_SHORTCUT_URL` — **build-time**, optional. Public iCloud Shortcut URL surfaced as the one-tap install button on Settings → API tokens. Unset → that step shows a placeholder explaining the deployer needs to publish their own shortcut. Passed as `ARG` in Dockerfile.
- `DB_PATH` — SQLite file path (default `./data/xpensify.db`, `/app/data/xpensify.db` in container).
- `PORT` — server port (default 3000).
- `DOMAIN` — e.g. `your-domain.com`. Used by the CSRF middleware to validate the `Origin` header on mutations. **Unset in dev** — CSRF check is skipped so the Vite proxy works.
- `NODE_ENV=production` — gates static-file serving + the `Secure` flag on session cookies.
- `<USERNAME>_PASSWORD` — initial seed password for each user defined in `config/users.yaml`. The env var name is the uppercased username (e.g. `ALICE_PASSWORD`). If unset, `seed-runner.ts` generates a random UUID and prints it to stdout **once**, only on first seed (existing users are skipped).
- `GEMINI_API_KEY` — optional. When set, the Apple Pay webhook calls Gemini Flash to suggest categories for never-seen merchants. Unset → the suggestion path is a silent no-op; pending rows are created without a category and the user picks one in Confirm.
- `BACKUP_DIR` — when set, the daily 03:30 cron snapshots SQLite via the online backup API into this directory (`xpensify-YYYY-MM-DD-HHMM.db`, 30-day retention by mtime). Unset → backups disabled, silent no-op. In Docker, point inside `/app/data` so it lands on the mounted volume.

## Design Tokens

All colors, spacing, and typography tokens live in `client/src/index.css` under the `@theme` block. Category colors are defined there too. Do not create a separate Tailwind config file.

## Database

- Server: SQLite via better-sqlite3, WAL mode, foreign keys on. Schema in `server/src/db/schema.sql`, seed data in `config/categories.yaml` + `config/users.yaml` (loaded by `seed-runner.ts`; overridable via `CATEGORIES_CONFIG` / `USERS_CONFIG` env vars).
- Client: IndexedDB via Dexie. Schema in `client/src/db/local.ts`. `sync_status` field is client-only.
- Amounts are INTEGER (cents) in both databases.
- **Dexie `orderBy()` requires indexed fields.** Categories only index `id`. Sort by `sort_order` in JS after `.toArray()`, not via `orderBy("sort_order")`.
- Expense `tags` and `image_url` columns are part of the schema on both ends but not yet surfaced in the UI. The sync route round-trips them; don't remove them.
- **Tables**: `users`, `sessions`, `categories`, `subcategories`, `expenses`, `recurring_templates`, `push_subscriptions`, `notification_preferences`, `api_tokens` (iOS Shortcuts auth), `merchant_categories` (household-wide merchant→category memory), `merchant_aliases` (maps POS name variants to a canonical merchant).
- **Expense `status` column**: `'confirmed'` (default, in sync stream) or `'pending'` (Apple Pay awaiting user confirmation, server-only). `category_id` / `subcategory_id` are NULLABLE on purpose so pending rows can have no category yet — see `relaxExpensesNullability()` in `migrate.ts`.
- **Expense `auto_saved` column**: 1 when the row was inserted by the Apple Pay webhook directly as `'confirmed'` via merchant memory ≥ 2 (no user touch). Drives the apple marker in History and the unreviewed-dot logic. Survives edits — the historical fact that "this entered without your involvement" doesn't change because you later corrected it.
- **`users.last_history_visit_at`**: timestamp gating the History tab's unreviewed-autosaves dot.

## API Surface

All mounted under `/api/*`, guarded by `csrfMiddleware` (Origin check) + `noStoreMiddleware` (Cache-Control: no-store). Auth is per-router, not global — `health`, `login`, and `shortcuts/*` are intentionally unauthenticated by session (the shortcut webhook uses Bearer tokens; the CSRF Origin check is also skipped for `/api/shortcuts/*` since iOS Shortcuts won't send a matching Origin).

- `GET  /api/health` — unauthenticated liveness probe.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`.
- `POST /api/sync` — batch upsert + delta fetch. Body is `{ changes, last_sync }`.
- `GET|POST|PATCH|DELETE /api/recurring[/:id]`, `GET /api/recurring/forecast`.
- `POST|DELETE /api/push/subscribe`, `GET|PUT /api/push/preferences`.
- `GET|POST /api/categories`, `PATCH|DELETE /api/categories/:id`, subcategory CRUD on `/api/categories/:id/subcategories` + `/api/categories/subcategories/:id`.
- `GET /api/export` — full CSV dump (all users — the ledger is shared).
- `GET|POST|DELETE /api/tokens[/:id]` — API token CRUD for iOS Shortcuts. POST returns the plain token **once**; only the SHA-256 hash is stored.
- `POST|GET /api/shortcuts/expense` — Apple Pay webhook. Bearer token (Authorization header **or** `?token=` query). Rate-limited to 60 req/min per token. Tolerant amount/timestamp/merchant parsers handle iOS locale variants (€1,23 vs 1.23, currency dicts, naturally-formatted dates). GET variant exists because Cloudflare drops Shortcuts' POST+JSON body with a generic 400.
- `GET /api/pending`, `PATCH /api/pending/:id/confirm`, `DELETE /api/pending/:id` — Apple Pay pending expenses lifecycle.
- `GET|PATCH|DELETE /api/merchants[/:merchant]`, `POST /api/merchants/:merchant/merge`, `GET /api/merchants/aliases`, `DELETE /api/merchants/aliases/:alias`, `POST /api/merchants/import` — merchant memory CRUD, alias management, and import backfill from confirmed Apple Pay history.
- `GET /api/history-marker`, `POST /api/history-marker/visit` — read/clear the History-tab "unreviewed Apple Pay autosaves" dot.
- Unknown `/api/*` paths return JSON 404, not the SPA shell. Non-`/api` paths in production fall through to `serveStatic` then to the cached `index.html`.

## Auth & Sessions

- Opaque session UUID in the `xpensify_session` cookie (HttpOnly; SameSite=Lax; Secure in production). 90-day expiry, stored in the `sessions` table.
- Login is rate-limited to 10 attempts per 15 min per IP, in-memory. Bcrypt cost 12 throttles naturally.
- CSRF defense is an Origin header check (`middleware/csrf.ts`). GET/HEAD/OPTIONS are exempt. Missing Origin is rejected. Only active when `DOMAIN` is set.
- Password change in `/api/auth/change-password` **rotates all sessions for the user** — every other device has to sign in again — and returns a fresh cookie for the current tab.
- Client-side: on 401 from `/api/sync`, the engine calls `logout()`, which wipes IndexedDB and hard-reloads to `/login`. This prevents pending expenses from being re-stamped under whoever signs in next on the device.
- The display profile is cached in `localStorage["xpensify_user"]` so offline cold-starts can render the shell and stamp `user_id` on new expenses without a network call. The HttpOnly session cookie is still the actual credential — the cached profile is rendering metadata only. `currentUser` is initialized synchronously from this cache at module load; `checkAuth()` runs as best-effort background revalidation (200 refreshes the cache, 401 clears it, network/5xx errors are no-ops). Without this cache, an offline boot rejected the `/api/auth/me` fetch and left the app stuck on a blank `<div id="app">` against the inline black background — the original "black screen offline" bug.
- Push subscription endpoints are allowlisted to known push-service hosts (FCM, Mozilla, Microsoft, Apple, Windows Notify) to block SSRF — see `isAllowedPushEndpoint` in `server/src/routes/push.ts`.

## Cron Jobs

Schedules wired up in `server/src/index.ts` via `node-cron` (server local time). Job bodies live in `server/src/jobs/`:

- `5 0 * * *` — `processRecurringTemplates()` (`jobs/recurring.ts`) generates any due expenses for active recurring templates (catch-up loop handles missed days). Also runs once on server startup.
- `0 3 * * *` — `sweepExpiredSessions(db)` (`jobs/sessions.ts`) deletes expired session rows. Runs on startup too.
- `0 * * * *` (Europe/Vienna) — `sendDailyReminders()` (`jobs/notifications.ts`) runs hourly and checks each user's `daily_reminder_time` preference to push at their chosen hour. Reminds users who opted in and have 0 expenses logged today.
- `0 * * * *` (Europe/Vienna) — `sendWeeklySummaries()` (`jobs/notifications.ts`) runs hourly and checks each user's `weekly_summary_day` + `weekly_summary_time` preferences. Sums all users' non-recurring expenses from this week's Monday 00:00 UTC through now — household total.

Expired/dead push subscriptions (404 or 410 from the push service) are auto-pruned inside `sendToUser`.

## Routing & Shell

`AuthenticatedShell` in `app.tsx` is a **persistent singleton** wrapping `TabTransitionContainer`. It does NOT remount per route, so the transition-layer DOM and its scroll position survive route changes. Header + BottomNav sit outside the container — only the middle animates.

Bottom-nav tabs (`/`, `/history`, `/recurring`, `/analytics`) use directional slide+crossfade. All other routes (`/settings`, `/settings/categories`, `/settings/merchants`, `/recurring/new`, `/recurring/edit/:id`, `/confirm`) navigate without transition — `navigateTab` bails early if either endpoint isn't a tab. Use plain `route(...)` from `useLocation()` for non-tab navigation; reserve `navigateTab()` for tab switches only.

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
- JSX marks animatable rows with `data-row`, containing `[data-row-text]` (icon + labels) and optional `[data-row-amount]` (trailing value, fades in on its own beat after the text settles) and optional `[data-row-line]` (a hairline divider that fades in on the same beat as the row's text — used so per-row rules reveal *with* the row instead of sitting fully drawn on load). Recurring rows skip `[data-row-amount]` and wrap the amount inside `[data-row-text]` so the whole row slides as one unit (no separate amount pop); History keeps the two split. The Recurring section header is itself a `data-row` so its eyebrow/total/hairline join the cascade.
- **Default hidden state is a CSS rule in `index.css`** gated on `[data-row-text]:not([data-revealed])` (likewise `[data-row-amount]` / `[data-row-line]`) — NOT an inline JSX style. This is critical (see gotcha below).
- `animateRowEntrance` is idempotent and re-entrant: it skips rows already marked `[data-revealed]`. Call it on data growth (infinite scroll, filter change, late data arrival) to reveal new rows without re-animating old ones.
- Incremental calls (rows appended after the initial entrance) reveal instantly — the full staggered cascade plays only on first fill.
- Dep-change cleanup snaps mid-animation rows to their final visible state so rapid re-renders can't strand rows at partial opacity.

When adding a new list screen: pass deps to `useEntrance` that change when rows appear (e.g. `[visibleCount, searchQuery, data?.length]`).

## Screen Cross-Links

- **Analytics drill-down** (`analyticsDrilldown` signal) — three levels: L1 all categories → L2 subcategories of a category → L3 top notes for a subcategory. The signal is reset in an Analytics unmount effect, so leaving and returning to the tab starts at L1.
- **Analytics → History** via "view in history" button — writes `historyFilter` signal with category/subcategory/month, routes to `/history`. History pre-populates its search box from the filter on mount; clearing the chip clears both.
- **History → Add (edit mode)** via `editingExpense` signal — the detail sheet's "edit" button stashes the expense and routes to `/`. `AddScreen` renders a save/cancel bar fixed above the nav when `editingExpense` is set.
- **Add (category-first flow)** — tapping a subcategory with amount still 0 stores a pending selection, shakes the amount input, and focuses it. Filling the amount and tapping again commits.
- **Add discretionary counter** — only counts `source !== "recurring"` expenses. Median-based outlier guard drops any month over 2× the median of the last 3. Helper extracted to `lib/discretionary.ts` and unit-tested.
- **Pending banner → Confirm** — `pendingExpenses` signal feeds a banner on Add. Tapping a row sets `confirmingPending` and routes to `/confirm`; the Confirm screen renders pre-filled amount/note/category, lets the user edit, then `PATCH /pending/:id/confirm` flips the row and upserts merchant memory.
- **Auto-saved indicator** — `hasUnreviewedAutoSaves` signal drives the accent dot on the History tab icon. Refreshed by `refreshUnreviewedAutoSaves()` on every sync; cleared when the History screen mounts (`markHistoryVisited()` → `POST /history-marker/visit`).

## Sync Protocol

POST `/api/sync` with `{ changes, last_sync }`. Server upserts with server-stamped `updated_at`, returns delta changes since `last_sync`. Initial sync (null `last_sync`) returns all records including tombstones. Last-write-wins conflict resolution based on ISO string comparison of `updated_at`.

**Pending Apple Pay expenses are excluded** from every sync response (`status = 'confirmed'` filter). They live server-side until the user confirms them through `/api/pending/:id/confirm`, at which point they enter the next sync stream.

**Server-rejected client writes are echoed back**: if the server has a newer `updated_at`, the client's change is dropped and the authoritative server row is included in the delta — even if the client just uploaded that ID. Implemented by tracking `acceptedIds` and excluding them from the delta SELECT (see `sync.ts`).

**Recategorization signal**: when a client edit changes the category of an `apple-pay` expense, `sync.ts` calls `resetMerchantMemory()` so the next transaction at that merchant goes pending again instead of auto-saving with the now-wrong category. Soft deletes don't trigger this.

Server also returns the **full** categories + subcategories list on every sync. The client reconciles by computing `staleIds = local - server`, `bulkDelete(staleIds)`, then `bulkPut(serverList)`. This way server-side deletes propagate without wiping any in-flight client inserts.

After the sync transaction, the engine fetches `/api/recurring`, `/api/pending`, and `/api/history-marker` to refresh their respective signals — all non-fatal on failure.

## Apple Pay & Merchant Memory

iOS Shortcut sends every Apple Pay transaction to `POST|GET /api/shortcuts/expense` with a per-user Bearer token. The webhook normalizes the merchant name (`lib/merchantNormalize.ts` strips trailing store IDs, `#` numbers, Austrian city suffixes) and consults `merchant_categories` (`lib/merchantMemory.ts`):

- **0 confirmations** (no row): row inserted with `status='pending'`, `category_id=null`. **Background**: Gemini Flash is invoked (`lib/flashCategorize.ts`) — if it returns medium/high confidence, the pending row is updated in-place with the suggestion before the user opens Confirm.
- **1 confirmation**: pending row created with the suggested `(category, subcategory)` pre-filled. Flash is **not** called — user-trained mapping always wins.
- **≥2 confirmations**: row inserted as `status='confirmed'` directly with the memorized category and `auto_saved=1`. Drives the apple marker in History.

Confirmation flow (`PATCH /api/pending/:id/confirm`) wraps the status flip + merchant memory upsert in a single SQLite transaction. Same-(category,subcategory) confirmation increments `confirmation_count`; different category resets it to 1 (the user disagreed with prior memory, so we start over). **Flash-accepted special case**: if the row had a Flash suggestion (no prior merchant_categories row, but pending row carried `(cat, sub)`) and the user confirmed unchanged, the new memory row is seeded at `confirmation_count = 2` — Flash + user counts as two votes, so the next hit at that merchant auto-saves.

When the user **edits** an already-confirmed Apple Pay expense and changes its category (sync flow), `sync.ts` calls `resetMerchantMemory()` to flip the count back to 1 — next webhook hit at that merchant goes pending again so the user can re-confirm. This is gated to `source === 'apple-pay'` and `deleted === 0` (soft deletes don't reset memory).

Memory is household-wide (PK is `merchant_normalized` alone) — both users contribute confirmations to the same row. `merchant_aliases` collapses POS name variants onto one canonical merchant so memory lookups and expense notes use consistent naming.

`Settings → Merchants` (`/settings/merchants`) renders the household's full memory; PATCH overrides a mapping (resets count to 1), DELETE removes it. Merchants can be merged via `POST /api/merchants/:merchant/merge`, which creates an alias and consolidates memory. `POST /api/merchants/import` backfills from existing confirmed Apple Pay history — picks the most-frequent (cat, sub) pair per merchant and never overwrites an existing memory row.

### Push notifications

xpensify (not the Shortcut) sends the push for every Apple Pay event. The Shortcut should have its "Show Notification" action removed or it'll duplicate. Variants live in `notifyApplePayExpense` in `jobs/notifications.ts`:

| Path | Title | Body |
|------|-------|------|
| Auto-saved (memory ≥ 2) | `auto-saved €X` | `merchant → category · subcategory` |
| Memory pre-fill (count = 1) | `tap to confirm €X` | `merchant → category · subcategory (suggested)` |
| Flash pre-fill (no memory) | `tap to confirm €X` | `🤖 merchant → category · subcategory (suggested)` |
| No suggestion | `tap to categorize €X` | `merchant` |

Push payload includes `tag` (per-expense, so notifications stack on the lock screen) and `data.url` for deep-linking. Pending notifications open `/?confirm=<id>` — the SW navigates the active client there, app.tsx parses the query, and pre-fills `confirmingPending`. Auto-saved notifications open `/history`. The SW also `postMessage`s clients on every push so the open app refreshes pending + history-marker in real time.

Both the push and the Flash call run in a `queueMicrotask`-scheduled background task after the webhook responds 200 — Shortcut latency is unaffected. Flash failures (timeout, error, or low-confidence response) silently fall back to the no-suggestion path; no retries.

### Gemini Flash (`lib/flashCategorize.ts`)

- Model: `gemini-3-flash-preview` via `@google/genai` SDK, `thinkingConfig.thinkingLevel = LOW`.
- Structured output (`responseMimeType: "application/json"`) with `category` enum locked to the seeded category names; `subcategory` is a free string and validated server-side against the chosen category (mismatch → drop subcategory, keep category if usable).
- `confidence` is required (`low | medium | high`); `low` is suppressed (treated as no suggestion).
- Disabled if `GEMINI_API_KEY` is unset — `isFlashEnabled()` returns false and the no-memory path stays "no suggestion" forever, no errors.
- 8s `AbortSignal`-style timeout via `Promise.race`. One log line per call.

## Service Worker

`client/src/sw.ts` — Workbox with `skipWaiting()` + `clientsClaim()` for immediate activation on deploy. Precaches the built app shell via `precacheAndRoute(self.__WB_MANIFEST)`. **No runtime caching of `/api/*`** — the offline store is IndexedDB (Dexie), and caching authenticated API responses risks leaking one user's data to the next. A legacy `api-cache` from older builds is explicitly deleted on activate.

`push` event: parses payload JSON (`title`, `body`, `icon`, `tag`, `url`) and calls `showNotification`. The `data.url` is stashed on the notification so `notificationclick` can deep-link via `client.navigate(target)` (focus existing tab) or `openWindow(target)` (no open tab). The push handler also fans out a `postMessage({ type: "push-received" })` to all controlled clients so the open app refreshes pending + history-marker without waiting for the next sync tick. The scheduler listens for this message in `sync/scheduler.ts`.

Build is wired up through `vite-plugin-pwa` in `strategies: "injectManifest"` mode (`vite.config.ts`) — the plugin compiles `src/sw.ts` and injects the precache manifest at `self.__WB_MANIFEST`. `injectRegister: false` and `manifest: false` because the app registers the SW manually and ships its own `public/manifest.json`. `devOptions.enabled: false` keeps the SW out of the dev server so Vite HMR isn't fighting it.

## Docker Build

Three stages in `Dockerfile`:
1. **client-build** — installs both client and server deps (server needs `python3 make g++` for better-sqlite3 native compile). Server deps are required because `@server/*` type imports must resolve during client `tsc`. `VITE_VAPID_PUBLIC_KEY` must be passed as a build `ARG`.
2. **server-build** — compiles server TypeScript.
3. **runtime** — copies `server/node_modules` from stage 2 and runs `npm prune --omit=dev`. Copies `server/dist`, `client/dist`, and the `.sql` files into `server/dist/db/`. Starts `node server/dist/index.js`.

`docker-compose.yml` mounts `./data:/app/data` for the SQLite file, attaches to the external `web` network (Caddy lives in a sibling stack named `flowdx`, not in this repo).

**Bump the app version on every deploy.** The version label in [Settings.tsx](client/src/screens/Settings.tsx) (search `v3.`) is the only build-stamp users see — increment it before every `docker compose up -d --build`. Acts as a "did the new bundle actually load?" check from the user side, and a sanity check during incident triage.

### Build performance

- Dockerfile header is `# syntax=docker/dockerfile:1.7` so BuildKit cache-mount syntax works. Every `npm ci` uses `--mount=type=cache,target=/root/.npm,sharing=locked` plus `--prefer-offline --no-audit --no-fund`. A `package-lock.json` bump still busts the layer, but npm's on-disk cache survives, so the re-install copies from disk instead of re-downloading from the registry.
- The single largest step is client `tsc && vite build` (~16s).
- `rollup-plugin-visualizer` emits `client/dist/bundle-stats.html` (treemap, gzip sizes) on every production build. Manual chunks split `motion` and `dexie` out of the main bundle (see `vite.config.ts`).
- Backup strategy and host-cron details are documented in CLAUDE.local.md (gitignored).

## Test Infrastructure

Vitest in both packages, `*.test.ts` files live next to the file they test.

- **Node version**: tests require Node **≥20.19** (`.nvmrc` pins `22`, `engines` floor enforced by the `pretest` guard in `scripts/check-node.mjs`). On older Node, vitest dies inside jsdom with a cryptic `ERR_REQUIRE_ESM` / "no tests" — the guard turns that into a clear message. Run `nvm use` first; the default shell Node may be an older system Node (e.g. `/usr/bin/node`). **Server tests additionally need a Node matching the compiled `better-sqlite3` native binary** — if you hit `NODE_MODULE_VERSION` mismatch, either switch to the Node the module was built against or run `npm rebuild better-sqlite3` under your current Node.
- **Server** (`server/vitest.config.ts`, Node env): per-file in-memory SQLite via `DB_PATH=:memory:` set in `src/test/setup.ts` before any module loads. Helpers in `src/test/db.ts` — `ensureMigrated()` runs schema once, `resetDb()` truncates between tests, `seedTestUsers()` / `seedTestSession()` / `seedTestApiToken()` / `insertExpense()` / `insertRecurringTemplate()` populate. `src/test/app.ts` mounts a Hono sub-router under `/api/<prefix>` and wraps `app.request(...)`.
- **Client** (`client/vitest.config.ts`, jsdom env): `src/test/setup.ts` imports `fake-indexeddb/auto` so Dexie writes go to an in-memory IDB; jest-dom matchers attached via `@testing-library/jest-dom/vitest`. `window.matchMedia` stubbed.
- **API mocks**: client tests use `vi.mock("@/lib/api", ...)` to stub the Hono RPC client (see `sync/engine.test.ts`).
- **Coverage targets** (current): sync route 100%, auth 95%, merchants 96%, recurring cron 92%, shortcuts 85%; format/discretionary helpers ~100%. Notifications, push, export, tokens, categories CRUD intentionally untested for now (low data-integrity risk).
- **Bcrypt cost in tests**: `seedTestUsers()` hashes at cost 4, not 12, to keep the auth suite under a few seconds.

## Gotchas

- **Preact re-renders clobber inline JSX styles** — If JSX sets `style={{ opacity: 0 }}` and then motion imperatively sets `el.style.opacity = "1"`, the NEXT re-render (new data, state change, list growth) re-applies the JSX inline style and hides the element again. For animated reveals, keep the default hidden state in a CSS rule gated on a data-attribute that JS adds (e.g. `[data-revealed]`). Never rely on JSX inline `opacity: 0` as a "until animated" marker — it regresses on every re-render. See [lib/entrance.ts](client/src/lib/entrance.ts) for the reference implementation.
- **Height animations** — for collapse/expand where content height is unknown, measure the old height synchronously in the click handler (before `setState`), capture it in a ref, then in `useLayoutEffect` read the new height and animate via CSS `transition: height` with `overflow: hidden`. See [CategoryBars.tsx](client/src/components/CategoryBars.tsx). Motion's `animate()` on height works too but the measure-before-commit pattern avoids a frame flash.
- **`useLiveQuery` returns `undefined` initially**, not `[]`. Guard accordingly — don't `return null` from components, show a loading skeleton instead.
- **`useLiveQuery` swallows errors** (logs to console). If a Dexie query fails (e.g. `orderBy` on non-indexed field), the result stays `undefined` forever with no visible error.
- **Timestamps**: new expenses use full ISO with real H:M:S for within-day ordering. Backdated expenses use `T12:00:00.000Z`. Imported expenses also use noon.
- **User IDs are UUIDs** defined per-user in `config/users.yaml` (idempotent on seed — existing user rows are skipped, so UUIDs are stable across reseeds). The shipped example uses `00000000-0000-0000-0000-000000000001` / `...0002`. History maps user → label/color by UUID, not by name substring.
- **`CREATE TABLE IF NOT EXISTS` doesn't add columns to existing tables.** Schema changes require `ALTER TABLE` on the live DB — add them to `server/src/db/migrate.ts` under `addColumnIfMissing`.
- **Viewport meta** disables zoom (`maximum-scale=1, user-scalable=no`) to prevent iOS Safari zoom on input focus. `viewport-fit=cover` was removed — it caused an iOS PWA cold-start tab-bar-above-home-indicator regression.
- **No shell transform** — `AuthenticatedShell` deliberately does not wrap content in a `transform`-ed ancestor. iOS Safari PWAs mis-measure fixed descendants inside transform'ed ancestors on cold start, leaving the bottom nav floating until the first touch reflow. Apply `max-w-[480px] mx-auto` on fixed children instead.
- **Safe-area bottom padding** — `.safe-pb` is a plain `16px` and `.safe-pb-lg` is `24px`. They are **not** safe-area aware; `BottomNav` handles the home-indicator inset itself via `calc(env(safe-area-inset-bottom, 0px) + 24px)`. Analytics uses a custom `calc(env(safe-area-inset-bottom, 0px) + 72px)` because its bottom card wants tighter breathing room above the nav.
- **Hono RPC param+body calls need `as any`** — e.g. `api.api.categories[":id"].$patch({ param: { id }, json: body } as any)`. The overload resolution fails on routes that take both. Already applied across the codebase; keep doing it.
- **`CREATE TABLE IF NOT EXISTS` won't relax constraints either.** When `expenses.category_id`/`subcategory_id` had to become NULLABLE for Apple Pay pending rows, `migrate.ts` rebuilt the table via `expenses_new` + `INSERT … SELECT … DROP … RENAME`. See `relaxExpensesNullability()`. Toggle `foreign_keys` OFF outside the transaction (sqlite refuses to flip mid-tx) before doing this kind of rebuild.
- **Hono sub-routers + trailing slashes** — when a sub-app declares `.get("/", …)` and is mounted via `.route("/api/pending", subapp)`, requests to `/api/pending/` 404 but `/api/pending` matches. Tests / fetch calls should use the no-trailing-slash form.
