# xpensify — Implementation Plan

## Context

Building a greenfield offline-first PWA for household expense tracking, replacing an AppSheet + Google Sheets setup. The core problem being solved is **speed of expense entry** — the current setup requires network round-trips that make logging tedious. The local-first architecture with sync-on-use eliminates that bottleneck.

The directory `/srv/xpensify/` is empty. This plan builds the app from scratch following the PRD.

### Key Decisions Made
- **Styling:** Tailwind CSS v4 — no config file, tokens defined in CSS `@theme` block
- **Amount storage:** Integer cents (store €32.50 as 3250), convert on display
- **State/routing:** Preact Signals + preact-iso (both from Preact team, minimal bundle)
- **Package setup:** Independent packages — separate `client/` and `server/` per PRD file structure

### Preconfigured (no user input needed during implementation)
- **Users:** Alice and Bob, both seeded with password `<redacted>` (change post-deploy via Settings)
- **Domain:** `your-domain.com` in Caddyfile
- **Git:** create GitHub repo via `gh repo create`, push after each phase
- **Docker network:** external `web` network (already exists on VPS)
- **VAPID keys:** generated during Phase 6 via `web-push generate-vapid-keys`, stored in `.env`
- **SESSION_SECRET:** generated random 64-char hex, stored in `.env`
- **PWA icons:** placeholder SVGs, replace with real ones later
- **Naming conventions:** DB name `xpensify`, cookie `xpensify_session`, localStorage key `xpensify_last_sync`
- **CSV file:** not needed until Phase 7 — import script built with synthetic test data, real CSV placed at `data/expenses.csv` when ready

---

## Phase 0: Project Scaffold & Dev Environment
**Goal:** `npm run dev` in client/ serves a Preact app accessible on phone via LAN. Backend health endpoint responds. Vite proxies API calls.

### Tasks

**0.1 — Root project files**
- `.gitignore` — node_modules, dist, *.db, .env, .DS_Store
- `.env.example` — `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `DB_PATH`, `PORT`, `DOMAIN`
- `git init` + `gh repo create xpensify --private --source=. --push`

**0.2 — Client scaffold (Preact + Vite + Tailwind)**
- `client/package.json` with scripts: `dev`, `build`, `preview`
- `client/vite.config.ts` — `server.host: true`, port 5173, proxy `/api` → `http://localhost:3000`, path alias `@/` → `src/`, `@server/*` → `../server/src/*` (type-only). Import `tailwindcss` from `@tailwindcss/vite` and add to Vite plugins array.
- `client/tsconfig.json` — strict mode, path aliases (`@/*` → `src/*`, `@server/*` → `../server/src/*` for type-only imports), JSX pragma for Preact
- `client/index.html` — meta viewport, theme-color `#0c0d12`, manifest link
- `client/src/main.tsx` — Preact render entry
- `client/src/app.tsx` — minimal shell with placeholder text
- `client/src/index.css` — Tailwind v4 setup. No `tailwind.config.ts`, no `postcss.config.js`. All design tokens in CSS `@theme` block:
  ```css
  @import "tailwindcss";
  @theme {
    --color-bg-primary: #0c0d12;
    --color-bg-surface: #1a1a22;
    --color-accent: #6c9cff;
    --color-success: #34c759;
    --color-warning: #ff9f0a;
    --color-danger: #ff375f;
    --color-recurring: #5e5ce6;
    --color-text-primary: #e8e8ed;
    --color-text-body: #c8c8d0;
    --color-text-secondary: #8e8e93;
    --color-text-tertiary: #6e6e73;
    --color-text-muted: #4a4a52;
    --color-text-hint: #3a3a42;
    --color-text-ghost: #2a2a32;
    /* ... all PRD section 4.1 tokens including category colors ... */
  }
  ```
  System font stack and base dark styles also in this file.
- `client/public/manifest.json` — PWA manifest (name: "xpensify", display: standalone, theme_color, background_color)
- Dependencies: `preact@^10.26.0` (pin to 10.x stable — do NOT use Preact 11 beta), `preact-iso`, `@preact/signals`, `dexie`, `motion` (~3.8KB gzipped, vanilla JS `animate()` only — NOT Motion for React)
- Dev dependencies: `typescript`, `vite`, `@preact/preset-vite`, `tailwindcss`, `@tailwindcss/vite`
- `client/src/lib/animations.ts` — shared spring presets used across all phases:
  ```ts
  export const springs = {
    snappy: { type: "spring" as const, stiffness: 400, damping: 25 },
    gentle: { type: "spring" as const, stiffness: 300, damping: 30 },
    bouncy: { type: "spring" as const, stiffness: 500, damping: 20 },
  }
  ```
- **Animation principle:** every tap gets immediate visual feedback (press state). State changes use springs, not CSS timing functions. Keep animations fast (200-350ms). Never let an animation delay the user's next action. Use CSS transitions for simple state changes (opacity, color); use Motion `animate()` for anything needing spring physics.

**0.3 — Server scaffold (Hono + SQLite)**
- `server/package.json` with scripts: `dev` (tsx watch), `build` (tsc), `start`, `migrate`, `seed`
- `server/tsconfig.json`
- `server/src/index.ts` — Hono app with `/api/health`, serves on `PORT` (default 3000)
- `server/src/db/connection.ts` — better-sqlite3 init, WAL mode, foreign keys on
- `server/src/db/schema.sql` — full schema from PRD section 3 (users, expenses, categories, subcategories, recurring_templates, push_subscriptions, notification_preferences, **sessions**). Amounts stored as INTEGER (cents). Expenses table includes a nullable `tags` TEXT column (unused in v1, schema-only for forward-compatibility with future hashtag parsing from note field). Sessions table: `id` TEXT PK, `user_id` TEXT FK → users.id, `expires_at` TEXT (ISO 8601).
- `server/src/db/seed.sql` — category + subcategory seed data from PRD section 3.8, recurring templates from section 3.9
- `server/src/db/migrate.ts` — runs schema.sql, idempotent (CREATE TABLE IF NOT EXISTS)
- Dependencies: `hono` (pin to latest ^4.x, run `npm audit` as part of build — recent releases patched cookie name validation and prefix bypass vulnerabilities, relevant since we use session cookies), `@hono/node-server`, `better-sqlite3`, `bcryptjs` (pure JS, no native compilation — avoids Docker multi-arch build issues; only 2 users so performance difference is irrelevant), `node-cron`, `web-push`, `uuid`
- Dev dependencies: `tsx`, `typescript`, `@types/better-sqlite3`, `@types/bcryptjs`

**0.4 — Docker + Caddy (production skeleton)**
- `docker-compose.yml` — `app` service (Node, port 3000) + `caddy` service (reverse proxy), using external `web` network (already exists on VPS)
- `Dockerfile` — multi-stage: build client → build server → runtime serves both
- `Caddyfile` — `your-domain.com`, reverse proxy `/api/*` to app, serve static frontend, auto-HTTPS via Let's Encrypt

### Verification
- `cd client && npm run dev -- --host` → phone opens `http://<LAN-IP>:5173`, sees dark-themed page
- `cd server && npm run dev` → `curl localhost:3000/api/health` returns `{"ok":true}`
- Vite proxy works: `http://localhost:5173/api/health` returns same response

---

## Phase 1: Add Expense Screen (Local-Only)
**Goal:** Full add-expense happy path writing to IndexedDB. No server sync. Target <5s entry time.

### Tasks

**1.1 — Dexie schema + category seed data**
- `client/src/db/local.ts` — Dexie database with tables: expenses, categories, subcategories. Indexes on expenses: `[date]`, `[category]`, `[sync_status]`, `[updated_at]`. Expenses table includes nullable `tags` TEXT column (unused in v1, forward-compatible with future hashtag parsing).
- `client/src/db/seed.ts` — seed categories + subcategories from PRD section 3.8 on first open (check version in Dexie)
- `sync_status` field is client-only, not synced to server
- Use **Dexie liveQuery** for reactive UI updates — instead of manually re-querying after mutations, liveQuery auto-rerenders components when relevant IndexedDB data changes. Pairs well with Preact signals. Use throughout History, Analytics, and anywhere data is displayed.

**1.2 — Category SVG icons**
- `client/src/icons.ts` — all 15 category icons as Preact functional components accepting `color` and `size` props
- Monoline style: stroke-width 1.5, stroke-linecap round, stroke-linejoin round, no fill
- Icons: food (coffee cup), living (house), household (wrench), transportation (truck), health (heart), subscriptions (refresh arrows), entertainment (star), insurance (shield), apparel (shirt), electronics (monitor), charlie (sun), education (book), travel (airplane), gift (gift box), other (ellipsis)

**1.3 — Amount input component**
- `client/src/components/AmountInput.tsx` — 44px weight-300 input inside rounded container with "EUR" prefix
- Auto-focused on mount, numeric inputmode for mobile keyboard
- Stores value in cents internally, displays formatted (e.g. "32.50")
- Thin accent-colored divider below

**1.4 — Category selector with zoom animation**
- `client/src/components/CategorySelector.tsx` — 3-column grid of tinted cards
- Each card: category icon (20px) + name (11px), tinted background (`{color}0d`) and border (`{color}18`)
- **Card press state:** on touch-start, scale card to 0.95 (CSS transform, 100ms). On touch-end, spring back via `animate(el, { scale: 1 }, springs.snappy)`.
- **On tap — zoom transition:** fade out other cards with CSS opacity transition (150ms staggered by distance), then spring the selected category to centered position using `animate()` with `springs.gentle`. Selected state: 48px container, 24px icon, name in accent color 15px weight 600.
- **Subcategory pills:** cascade in with staggered springs (50ms offset per pill), tinted in parent category color. Uses `springs.gentle`.
- Tapping selected category header reverses animation back to grid
- **Auto-save:** categories with 1 subcategory save immediately on category tap (no subcategory step)

**1.5 — Toast component**
- `client/src/components/Toast.tsx` — green-tinted pill at top of screen, e.g. "✓ EUR 32.33 → groceries saved"
- **Entrance:** spring slide-in from top: `animate(toast, { y: [-20, 0], opacity: [0, 1] }, springs.gentle)`
- Auto-dismiss after 2 seconds, fade out with CSS opacity transition

**1.6 — Note input with autocomplete**
- When "+note" is expanded, show a text input with autocomplete suggestions
- Source: query distinct non-empty `note` values from IndexedDB, sorted by frequency (count of expenses with that note, descending)
- Filter suggestions as the user types (case-insensitive prefix match)
- Show max 5 suggestions as tappable pills below the input, styled with the same tinted-pill pattern as subcategories
- Tapping a pill fills the note field with that value
- No suggestions shown when input is empty (avoids clutter on first tap)

**1.7 — Add Expense screen assembly**
- `client/src/screens/Add.tsx` — default landing screen
- Layout top to bottom: amount input → date label ("today, 12 apr 2026" in ghost color) → category grid
- "+note" and "+date" expandable links below category area (collapsed by default)
- "+date" expands a native `<input type="date">` styled for dark theme (dark background, light text, accent selection color). Opens the OS date picker on iOS/Android — faster than any custom calendar. Default value: today as ISO string. When changed, used as expense `timestamp`.
- On subcategory tap: save to Dexie with `sync_status: 'pending'`, show toast, reset screen for next entry
- **Save confirmation pulse:** before resetting the amount input, pulse the amount text: `animate(amountEl, { scale: [1, 0.97, 1] }, springs.bouncy)` — creates a tactile "compression" feel
- Date defaults to now, note is optional free-text with autocomplete (task 1.6)
- **Edit mode:** accepts an optional `editingExpense` signal. When set:
  - Amount, category, subcategory, note, and date are pre-filled from the existing expense
  - Category selector opens directly to the correct subcategory view (skip grid, show selected category + subcategory pills)
  - On save: `db.expenses.update(id, { ...updates, updated_at: new Date().toISOString(), sync_status: 'pending' })` instead of `db.expenses.add()`
  - Toast shows "updated" instead of "saved"
  - After save, clear `editingExpense` signal and navigate back to History

**1.8 — Bottom navigation + app shell**
- `client/src/components/BottomNav.tsx` — 4 tabs: add, history, recurring, analytics. Active tab: 36px circle with accent-tinted background, accent label. Inactive: 0.5 opacity.
- `client/src/components/Header.tsx` — xpensify logo + wordmark left, sync indicator right (placeholder for now)
- `client/src/app.tsx` — preact-iso router, lazy-load screens. Add is default `/`. Other screens show "coming soon" placeholder.
- Settings accessible from gear icon in header (not a tab)

### Verification
- Open on phone → amount input auto-focused with numeric keyboard
- Type "32.50" → tap "food" → see subcategories cascade in → tap "groceries" → toast shows → screen resets
- Tap "electronics" (1 subcategory) → saves immediately, no subcategory step
- Expand "+note" → type "spo" → see "spotify" suggestion pill (if previously entered) → tap pill → note filled
- Expand "+date" → native OS date picker opens → select a past date → expense saved with that date
- Edit mode: pre-filled amount, category selector shows correct subcategory view, toast shows "updated"
- Refresh page → expense persists in IndexedDB (verify via DevTools)
- Entire happy path under 5 seconds

---

## Phase 2: Auth + Sync Engine
**Goal:** Server stores expenses, client syncs bidirectionally. Two user accounts work across devices.

### Tasks

**2.1 — Auth routes + middleware**
- `server/src/routes/auth.ts` — POST `/api/auth/login` (validate password, set HTTP-only secure cookie, 90-day expiry), POST `/api/auth/logout` (clear cookie), GET `/api/auth/me` (return current user)
- `server/src/middleware/auth.ts` — session cookie middleware, checks cookie on every `/api/*` route (except login), 401 if invalid
- Password hashing with `bcryptjs` (pure JS, no native deps)
- Session stored in SQLite `sessions` table (defined in schema.sql Phase 0.3)
- Seed exactly 2 hardcoded user accounts in `seed.sql`: **Alice** and **Bob**, with bcryptjs-hashed passwords. No dynamic user creation.

**2.2 — Login screen**
- `client/src/screens/Login.tsx` — simple username + password form, dark themed
- On success: store user info in signal, redirect to Add screen
- On 401 from any API call: redirect to login
- In daily use: cookie persists, no login prompt needed

**2.3 — Hono RPC type-safe client**
- Server exports app type: `export type AppType = typeof app` from `server/src/index.ts`
- Client imports via TypeScript path alias (`@server/*` → `../server/src/*`, configured in Phase 0.2). Type-only import — TypeScript strips it at compile time, no runtime dependency on server code:
  ```ts
  // client/src/lib/api.ts
  import type { AppType } from '@server/index'
  import { hc } from 'hono/client'
  export const api = hc<AppType>('/')
  ```
- Gives full type inference on all API calls with zero runtime overhead. Especially valuable for the sync engine where request/response shape is critical.

**2.4 — Sync endpoint (server)**
- `server/src/routes/sync.ts` — POST `/api/sync`
- Request: `{ changes: Expense[], last_sync: string | null }`
- **Server is clock authority.** When processing incoming changes, the server stamps `updated_at` with the server's current time (not the client-provided `updated_at`). This prevents clock skew between devices from causing incorrect conflict resolution. The client's `updated_at` is only used locally to track dirty records. The server's `updated_at` is the canonical timestamp for delta sync queries.
- Server logic (in a transaction):
  1. For each client change: upsert by `id`, stamping `updated_at = NOW()` (server time). If server record has newer `updated_at`, keep server version (last-write-wins).
  2. Query all records where `updated_at > last_sync` AND `id` not in just-applied client changes
  3. Return `{ server_changes: Expense[], sync_timestamp: string }`
- Also syncs categories/subcategories in the same request (they rarely change, but Settings screen can modify them)

**2.5 — Sync engine (client)**
- `client/src/sync/engine.ts` — core sync logic:
  - `sync()`: gather Dexie records with `sync_status: 'pending'`, POST to `/api/sync` with `last_sync` from localStorage
  - **Initial full sync (new device):** when `last_sync` is null, client sends `{ changes: [...local pending], last_sync: null }`. Server returns ALL non-deleted records (~3,700 records × ~200 bytes ≈ ~700KB one-time transfer, <2s on any connection). Client bulk-inserts all received records into Dexie with `sync_status: 'synced'`. All subsequent syncs are delta-only.
  - On success: mark sent records as `synced`, upsert received records, update `last_sync` in localStorage
  - On failure: mark as `error`, don't update timestamp
  - On network error: set status to offline, skip
- Sync triggers (no pull-to-refresh — unreliable in iOS PWAs, not worth the complexity):
  - **On focus:** `visibilitychange` event fires sync immediately
  - **While active:** 30-second interval timer
  - **On save:** sync after each expense save
  - **Manual sync button:** always visible in header, tappable to force sync
- `client/src/sync/status.ts` — Preact signal: `{ state: 'idle'|'syncing'|'offline'|'error', pendingCount: number }`

**2.6 — Sync UI indicators**
- `client/src/components/SyncIndicator.tsx` — in header: green 7px circle when synced, blue badge with pending count when entries waiting (e.g. "1 pending"), amber on error
- Per-expense pending indicator in History (Phase 3)

### Verification
- Log in as Alice on phone, add expense → syncs to server SQLite
- Open on laptop as Bob → initial full sync pulls all records (<2s) → expense appears
- Turn off network → add expense → shows pending badge → turn on network → focus app → syncs automatically
- Force-close and reopen → cookie persists, no login needed
- Verify type-safe API client catches contract mismatches at compile time

---

## Phase 3: History Screen
**Goal:** Browse expenses grouped by day, search/filter, view/edit/delete via bottom sheet.

### Tasks

**3.1 — Bottom sheet component**
- `client/src/components/DetailSheet.tsx` — reusable bottom sheet: slides up from bottom, 4px drag handle, dark surface background (`bg-surface`), 24px rounded top corners, dark overlay behind
- **Open:** spring slide-up: `animate(sheet, { transform: "translateY(0%)" }, springs.gentle)`. Overlay fades in with CSS.
- **Close:** fast ease-out (not spring) so dismissal feels snappy — `animate(sheet, { transform: "translateY(100%)" }, { duration: 0.2, easing: "ease-out" })`
- Will be reused across History, Recurring, and Settings screens

**3.2 — History screen with day grouping**
- `client/src/screens/History.tsx`
- Grouped by day: date header with relative label ("today", "yesterday", "10 apr") left, daily total ("EUR 42.33") right
- Each row: category icon (36px tinted container) | subcategory name + optional note below | user avatar (18px initial circle, blue for Alice, purple for Bob) | amount right-aligned
- **List item press state:** scale 0.98 on touch-start (CSS transform), spring back on release via `animate(el, { scale: 1 }, springs.snappy)`
- Recurring entries show purple "recurring" badge
- Pending entries show amber "pending" indicator
- Data source: Dexie query, sorted by `timestamp` DESC

**3.3 — Search and filtering**
- `client/src/components/SearchFilter.tsx` — search bar at top with magnifying glass icon
- Instant as-you-type filtering (<100ms) across category, subcategory, note, and amount
- Day headers hide when all their entries are filtered out
- Client-side only — queries Dexie with indexes

**3.4 — Infinite scroll**
- Load 30 days initially, load more on scroll via IntersectionObserver
- No external library needed

**3.5 — Expense detail bottom sheet**
- Tap entry → bottom sheet with centered layout: category icon (44px) centered, amount in category accent color (28px), category → subcategory breadcrumb, detail rows (date, note, logged by, source)
- Recurring-sourced expenses show "source: recurring" as an informational label (not a link). Editing operates on the single generated instance only — no option to modify the underlying template from History. Template management is exclusively in the Recurring tab.
- Edit button (blue) → sets `editingExpense` signal with the current expense data → navigates to Add tab (which enters edit mode per task 1.7)
- Delete button (red) → inline confirmation via `client/src/components/ConfirmDialog.tsx`: tapping "delete" transforms the delete button row into "are you sure?" text with "cancel" (returns to normal) and "delete" (red, performs soft delete). Spring animation on the button swap transition. No separate modal or second bottom sheet — stays within the existing sheet. On confirm: soft delete (`deleted: 1`, `sync_status: 'pending'`)

### Verification
- History shows all expenses grouped by day with correct totals
- Search "groceries" → instant filter, only matching entries shown
- Scroll down → more days load seamlessly
- Tap entry → detail sheet → tap Edit → Add screen opens pre-filled → change amount → save → toast "updated" → back to History → amount updated
- Tap entry → detail sheet → tap Delete → inline "are you sure?" with cancel/delete buttons (spring animation) → tap delete → removed from view, synced as soft delete
- Recurring expense detail sheet shows "source: recurring" label, edit modifies instance only

---

## Phase 4: Recurring Expenses
**Goal:** Define templates, server auto-generates expenses daily, client shows forecast.

### Tasks

**4.1 — Server-side cron job**
- `server/src/jobs/recurring.ts` — runs daily at 00:05 via node-cron
- For each active template where `next_due <= today`: create expense with `source = 'recurring'`, advance `next_due`
- Catch-up logic: if server was offline multiple days, generate all missed entries
- Idempotent: check if expense already exists for template + date before creating

**4.2 — Recurring API routes**
- `server/src/routes/recurring.ts` — full CRUD: GET list, POST create, PATCH update, DELETE
- GET `/api/recurring/forecast` — remaining recurring expenses for current month

**4.3 — Recurring screen**
- `client/src/screens/Recurring.tsx`
- **Top: Forecast card** — blue-tinted card with "remaining this month" heading, large amount (32px, accent), subtitle "6 of 23 expenses still due in april", breakdown list (struck-through for generated, normal for upcoming)
- **Bottom: Template list** — section headers "monthly templates" / "yearly templates", each row: category icon (34px) | name + schedule | amount | active/inactive toggle (40×24px pill)
- Sorted by amount descending
- **Toggle switch animation:** spring on the knob — `animate(knob, { x: newPosition }, { type: "spring", stiffness: 500, damping: 28 })` so it slightly overshoots and settles
- Tap row → edit form (same as creation, pre-filled)
- "Add recurring expense" button at bottom (accent outline)

**4.5 — Recurring template creation/edit form**
- Full-screen form (not a bottom sheet — too many fields). Routes: `/recurring/new` and `/recurring/edit/:id`
- Fields:
  - Amount input (reuse AmountInput component)
  - Category/subcategory (reuse CategorySelector in **compact mode** — grid + subcategory pills only, no zoom animation)
  - Note input (reuse note input with autocomplete)
  - Frequency: three tappable pills — "monthly" / "weekly" / "yearly"
  - Day of month: number input (1-28), only shown when frequency is "monthly"
  - Active toggle (on by default)
  - Save button (accent color) + Cancel link
- Edit mode: same form, pre-filled from template data

**4.4 — Client-side forecast computation**
- Compute from recurring templates in Dexie: sum active templates with `next_due` in current month minus already-generated expenses this month

### Verification
- Tap "Add recurring expense" → full-screen form → fill amount, select category (compact mode), set frequency "monthly", day 1 → save → appears in list
- Server cron generates expense on due date → shows in History with recurring badge
- Forecast card shows correct remaining amount for current month
- Toggle template inactive → excluded from forecast
- Seed all 25 recurring templates from PRD section 3.9 → forecast shows accurate monthly projection

---

## Phase 5: Analytics Screen
**Goal:** Monthly spending insights with category breakdown and trend chart.

### Tasks

**5.1 — Analytics data utilities**
- Client-side computation from Dexie (no server round-trip needed):
  - `getMonthlyTotal(year, month)` — sum all expenses
  - `getCategoryBreakdown(year, month)` — sum per category, sorted descending
  - `getMonthlyTrend()` — total per month for all historical data

**5.2 — Category breakdown bars**
- `client/src/components/CategoryBars.tsx` — horizontal bar chart: category name (right-aligned) | colored bar (proportional width) | amount (right-aligned)
- **Bar entrance:** staggered springs — each bar animates width from 0 to target with `{ type: "spring", stiffness: 200, damping: 20 }` and 30ms stagger per bar. Re-animates on month change.
- Sorted by amount descending, bars use category accent colors
- **Drill-down:** tapping a category bar navigates to History tab with pre-applied filter for that category + month. Sets a shared signal `{ category: string, month: string } | null`. History reads this on mount to pre-populate search/filter. A "clear filter" chip appears at top of History when active. Reuses existing search/filter infrastructure from Phase 3.3.

**5.3 — Monthly trend chart**
- `client/src/components/TrendChart.tsx` — horizontally scrollable strip of vertical bar columns
- Each bar: value label on top ("6.5k"), colored bar (proportional height), month label below ("apr'26")
- **Bar entrance:** staggered springs for height, same pattern as category bars (30ms stagger, `{ type: "spring", stiffness: 200, damping: 20 }`)
- Selected month highlighted in accent blue, others in muted gray
- Tapping a bar selects that month — updates everything above
- Auto-scrolls to rightmost (most recent) on load

**5.4 — Analytics screen assembly**
- `client/src/screens/Analytics.tsx`
- Month selector: left/right arrows (32px circles) + month label centered
- Two summary cards side-by-side: "total spent" with vs-previous-month comparison (green ↓ or red ↑), "daily average" with day count
- **Number rolling:** when monthly total or daily average changes (month navigation), animate the number counting up/down: `animate(value => { el.textContent = formatCurrency(value) }, { duration: 0.4 })` — no snapping.
- Category bars below, then trend chart at bottom

### Verification
- Select different months → summary, bars, and trend all update
- Tap a bar in the trend chart → selects that month
- Category bars have correct proportional widths and category colors
- Tap a category bar → navigates to History with that category + month pre-filtered → "clear filter" chip visible → tap to clear
- All data computed instantly from local IndexedDB (<100ms)

---

## Phase 6: PWA + Service Worker + Push Notifications
**Goal:** Installable PWA, full offline support, push notifications for reminders and summaries.

### Tasks

**6.1 — Service worker with Workbox**
- Use `vite-plugin-pwa` with **injectManifest** strategy (not generateSW) — the custom sync-on-visibility-change behavior requires a hand-written service worker; injectManifest lets you write custom SW logic while still getting Workbox's precaching for the app shell
- `client/src/sw.ts` — custom service worker: Workbox precaching for app shell (HTML, JS, CSS), network-first for API with offline fallback, plus custom sync trigger logic
- Register SW in `client/src/main.tsx`
- PWA icons in `client/public/icons/` (192px, 512px)

**6.2 — Offline indicators**
- Track `navigator.onLine` + `online`/`offline` events via a signal
- Sync engine respects offline state (queues changes, doesn't attempt network)
- Offline banner or sync indicator change when disconnected

**6.3 — Push notification infrastructure**
- `server/src/routes/push.ts` — POST `/api/push/subscribe`, DELETE `/api/push/subscribe`, GET/PUT `/api/push/preferences`
- VAPID key generation script (one-time, keys stored as env vars)
- `server/src/jobs/notifications.ts`:
  - Weekly summary: cron on configured day/time, sends spend summary via web-push
  - Daily reminder: cron at configured time, sends only if zero expenses logged that day
  - Reuse user-querying logic from `server/src/jobs/recurring.ts` rather than duplicating it — both jobs need active users and their preferences
- Client-side: push permission request flow in Settings, save subscription to server

### Verification
- Install PWA on phone home screen → loads in <500ms
- Turn off network → app works fully, expenses save to IndexedDB
- Turn on network → pending expenses sync
- Enable push notifications → receive weekly summary on configured day
- Enable daily reminder → receive notification if no expenses logged

---

## Phase 7: Settings, Import, Production Deploy
**Goal:** CSV import from Google Sheets, settings management, production-ready Docker deployment.

### Tasks

**7.1 — Settings screen**
- `client/src/screens/Settings.tsx`
- Sections: Categories management (reorder with up/down arrow buttons — no drag-and-drop, unreliable on mobile touch; each row: icon | name | ↑ | ↓ | edit | delete), add/edit/delete categories and subcategories, assign icon and color. Users (password change only — no add/delete, only 2 hardcoded users). Push notification preferences. Data (export CSV, import CSV). Sync controls (last sync time, force full sync, clear local cache). About (version).

**7.2 — CSV import + backfill**
- `scripts/import-csv.ts` — CLI script: parse Google Sheets CSV, validate against category seed data, bulk insert with `source = 'import'`
- **Skip empty rows:** the CSV contains ~9 blank rows — skip any row where `id` is empty or whitespace-only
- **Float-to-cents conversion:** CSV has float values (e.g. "32.33") but we store integer cents. Use `Math.round(parseFloat(row['amount in EUR']) * 100)` — the `Math.round` is critical to avoid floating-point artifacts (e.g. `32.33 * 100 = 3232.9999...`)
- Dry-run mode: report what will be imported + flag unrecognized categories
- Idempotent: upsert on `id`, safe to re-run
- Post-import backfill SQL from PRD section 9.4 (rename health→medical, baby→charlie, move insurance entries)
- Log row counts per backfill statement

**7.3 — CSV export**
- GET `/api/export` → generate CSV from all expenses, download via browser

**7.4 — Production Docker build**
- `Dockerfile` — multi-stage: build client (Vite), build server (tsc), runtime copies both
- `docker-compose.yml` — app + caddy services, SQLite volume mount
- `Caddyfile` — domain config, auto-HTTPS via Let's Encrypt
- Env vars: `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `DB_PATH`, `DOMAIN`

**7.5 — Performance audit**
- Verify JS bundle <50KB gzipped (Preact ~4KB, Dexie ~20KB, Motion ~3.8KB, app code ~15-20KB)
- Lazy-load all screens except Add (code splitting via dynamic `import()`)
- Lighthouse PWA score >95
- Test IndexedDB performance with 50k+ synthetic records

### Verification
- Export CSV → valid file downloads with all expenses
- Import Google Sheets CSV in dry-run → review output → import for real → verify record count
- Run backfill → correct category reassignments, logged row counts
- `docker compose up -d --build` → app accessible via HTTPS on domain
- Lighthouse audit passes PWA and performance targets

---

## Critical Files Summary

| File | Role |
|------|------|
| `client/src/sync/engine.ts` | Highest-risk: sync protocol, conflict resolution, retry logic |
| `client/src/db/local.ts` | Dexie schema — every screen depends on this |
| `client/src/components/CategorySelector.tsx` | Most complex UI — zoom/ripple/cascade animation |
| `client/src/screens/Add.tsx` | Primary screen, <5s entry time measured here |
| `server/src/routes/sync.ts` | Server-side sync — must be transactional and correct |
| `server/src/db/schema.sql` | Full database schema, amounts in integer cents |
| `server/src/middleware/auth.ts` | Session cookie auth for all API routes |
| `server/src/jobs/recurring.ts` | Daily cron with catch-up logic |
| `client/src/lib/animations.ts` | Shared spring presets — used by every animated component |
| `client/src/lib/api.ts` | Hono RPC type-safe client — all API calls go through here |

## Risks

1. **Sync engine correctness** — Mitigation: extensive logging, soft deletes everywhere, "force full sync" escape hatch in Settings
2. **Bundle size** — Mitigation: Preact + Dexie are light, lazy-load screens, monitor with `vite build`
3. **Category animation performance on mobile** — Mitigation: CSS transforms only (GPU-accelerated), test on real phone early in Phase 1
4. **iOS PWA push notification quirks** — Mitigation: test on iOS 16.4+ Safari, graceful fallback if permission denied
