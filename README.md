# xpensify

a fast, offline-first PWA for shared household expense tracking.

xpensify is built around one goal: log an expense in under five seconds. it runs locally in the browser via IndexedDB, syncs on use to a small self-hostable server, and is optimized for iOS Safari installed as a home-screen app. two-to-four trusted users share a single ledger across devices.

## Features

- **offline-first** — every read and write hits IndexedDB first; sync runs in the background on visibility, on a 30s tick, after each save, on pull-to-refresh, or on demand.
- **instant entry** — amount keypad, category-first flow, recent-merchant suggestions; built for one-handed thumb use.
- **shared sync** — two-to-four household members share the same ledger. last-write-wins on `updated_at`, with server as the clock authority. soft deletes propagate as tombstones so views stay consistent.
- **recurring expenses** — templates generate due expenses each morning; backfills any missed days on server restart.
- **Apple Pay auto-categorization** — an iOS Shortcut posts every Apple Pay transaction to a per-user webhook. the server remembers merchant -> category mappings, and after two confirmations of the same category, future hits auto-save. for never-seen merchants, Gemini Flash can suggest a category that the user confirms or overrides.
- **push notifications** — daily reminders, weekly household summary, and per-transaction Apple Pay pings with deep-links into the confirm screen.
- **CSV import / export** — bulk import via a script, one-click full export from settings.
- **analytics with drill-down** — month picker, category trend, three-level drill (categories -> subcategories -> top notes), and cross-link into a filtered history view.

## Screenshots

<!-- TODO: add screenshots -->

## Target Devices

xpensify is built and tested exclusively for **iOS Safari PWA on iPhone 15 Pro / 16 Pro**, installed to the home screen. desktop browsers and Android are intentionally not supported. layout, gestures, safe-area handling, and performance budgets all assume that target. it will load on other devices, but expect rough edges.

## Quick Start (self-host with Docker)

```bash
git clone https://github.com/YOUR_USER/xpensify.git
cd xpensify
cp .env.example .env
# edit .env — at minimum set <USER>_PASSWORD vars for each user in config/users.yaml,
# or leave them unset to have random ones generated and printed once on first seed.
# Generate a VAPID keypair (see below) if you want push notifications.
cp config/users.example.yaml config/users.yaml
# edit config/users.yaml — change the alice/bob placeholders to your household members.
docker compose up -d --build
```

the server listens on port `3000`. point a reverse proxy at it (Caddy, nginx, Traefik) and set `DOMAIN` to the public hostname.

### dev-mode caveat: CSRF

the CSRF defense is an `Origin` header check. when `DOMAIN` is **unset**, the check is skipped entirely so that local development works against the Vite dev server. **always set `DOMAIN` in production.** if it's unset on a public deployment, mutation endpoints accept cross-origin requests.

### generating VAPID keys (push)

```bash
npx web-push generate-vapid-keys
```

paste the public key into both `VAPID_PUBLIC_KEY` and `VITE_VAPID_PUBLIC_KEY`, and the private key into `VAPID_PRIVATE_KEY`. push is silently skipped if any of these is unset.

## Configuration

all configuration is via environment variables. copy `.env.example` to `.env` and edit.

| Variable | Required | Description |
|---|---|---|
| `DOMAIN` | yes (prod) | public hostname (e.g. `expenses.example.com`). used by the CSRF middleware to validate the `Origin` header on mutations. leave unset only in local dev. |
| `PORT` | no | server port. defaults to `3000`. |
| `DB_PATH` | no | SQLite database file path. defaults to `./data/xpensify.db`. inside Docker this should stay under `/app/data` so it lands on the mounted volume. |
| `<USERNAME>_PASSWORD` | no | initial password for each user defined in `config/users.yaml`. env var name is the uppercased username (e.g. `ALICE_PASSWORD`, `BOB_PASSWORD`). only used on first seed. if unset, a random password is generated and printed to the seed log once. |
| `SESSION_SECRET` | no | reserved. sessions are currently opaque UUIDs stored server-side, not signed tokens. |
| `VAPID_PUBLIC_KEY` | no | server-side VAPID public key for web-push. push is disabled if unset. |
| `VAPID_PRIVATE_KEY` | no | server-side VAPID private key. must pair with the public key. |
| `VITE_VAPID_PUBLIC_KEY` | no | build-time copy of the public key, baked into the client bundle. must match `VAPID_PUBLIC_KEY`. |
| `GEMINI_API_KEY` | no | optional. when set, the Apple Pay webhook calls Gemini Flash to suggest categories for never-seen merchants. unset -> AI suggestions are a silent no-op and the user just picks a category in the confirm screen. |
| `BACKUP_DIR` | no | when set, a daily 03:30 cron snapshots the SQLite DB into this directory (`xpensify-YYYY-MM-DD-HHMM.db`, 30-day retention). unset -> backups disabled. in Docker, point at a path inside `/app/data`. |
| `NODE_ENV` | no | set to `production` in the Docker image. gates static file serving and the `Secure` flag on session cookies. |

to change the default `alice` / `bob` users (rename, add a third user, swap avatar colors), edit `config/users.yaml` before the first seed. the file is gitignored — only `config/users.example.yaml` is committed.

## First-time Setup

after the container is up (or in a dev checkout), run the migration and seed inside the server package:

```bash
cd server
npm run migrate   # idempotent — creates schema, runs ALTER TABLE backfills
npm run seed      # seeds categories, subcategories, and users
```

inside the Docker image these are wired into the entrypoint, so on a fresh volume they run automatically on first boot. running them again is safe — existing users are skipped, and any generated random passwords are only printed on the **first** seed of a given DB.

once seeded, browse to the host and sign in. open settings -> "force full sync" to verify the round trip.

## Tech Stack

- **client** — Preact 10, TypeScript, Vite, Tailwind CSS v4, Preact Signals, preact-iso, Dexie (IndexedDB), motion.dev (vanilla `animate()`), Workbox (service worker via vite-plugin-pwa).
- **server** — Hono 4 on Node.js, better-sqlite3 (WAL mode, FKs on), node-cron for scheduled jobs, web-push for notifications, bcryptjs for password hashing (pure JS — sidesteps Docker multi-arch native-build issues), `@google/genai` for optional Gemini Flash categorization.
- **shared** — Hono RPC gives the client a type-safe view of the server API via type-only imports.

## Development

```bash
# client (Vite dev server with HMR on :5173, proxies /api -> :3000)
cd client && npm run dev

# server (tsx watch on :3000)
cd server && npm run dev
```

run them in two terminals. the Vite proxy means you don't need to set `DOMAIN` in dev — CSRF skips when `DOMAIN` is unset.

### tests

Vitest in both packages, with `*.test.ts` files next to the file they test.

```bash
cd server && npm test    # node env, in-memory SQLite
cd client && npm test    # jsdom env, fake-indexeddb
```

watch mode: `npm run test:watch`. coverage: `npm run test:coverage` (HTML report in `coverage/`).

### CSV import

```bash
npx tsx scripts/import-csv.ts --dry-run /path/to/expenses.csv   # preview
npx tsx scripts/import-csv.ts /path/to/expenses.csv             # commit
```

CSV columns: `id, timestamp, category, subcategory, amount in EUR, note, user`. Rows missing
`user` default to `$DEFAULT_IMPORT_USER` or the alphabetically first seeded user. Pass
`--legacy-aliases` to apply the deployer-specific baby→charlie / health→medical aliases.

### regenerate PWA icons

```bash
npx tsx scripts/generate-icons.ts
```

## Apple Pay Setup

xpensify's Apple Pay flow uses an iOS Shortcut as the bridge — when Apple Pay completes a transaction, a personal automation fires the shortcut, which POSTs the merchant + amount to xpensify.

rough setup:

1. on the phone, open the app and go to **settings -> API tokens** and generate a new token. copy it immediately — only the SHA-256 hash is stored on the server, so you cannot retrieve the plain token again.
2. import the xpensify iOS Shortcut (publishing the shortcut itself is left to the deployer — the webhook contract is documented under `POST /api/shortcuts/expense` in the server source). once you've published your own to iCloud, set `VITE_APPLE_SHORTCUT_URL` to the shared link before building the client; the Settings → API tokens screen will then surface a one-tap install button.
3. paste the token and your xpensify hostname into the shortcut's configuration.
4. in the Shortcuts app, create a personal automation: **Apple Pay -> any card -> run shortcut**, with "ask before running" turned off.
5. **remove the "Show Notification" action** from the shortcut if it has one — xpensify sends its own push for every Apple Pay event, so leaving the shortcut's notification on duplicates them.

once the loop is live: the first time you spend at a new merchant the row arrives as `pending` and you confirm a category. on the second confirmation of the same category, the third hit auto-saves silently. push notifications carry a deep-link straight to the confirm screen.

if you set `GEMINI_API_KEY`, never-seen merchants also get a Gemini Flash suggestion pre-filled in the pending row.

## Security

xpensify is **single-tenant by design**. it assumes a household of two-to-four trusted users sharing one ledger and one server. there is no permission model beyond "logged in" — anyone signed in sees the whole household's spending. don't share an account with people you wouldn't share a credit-card statement with.

current security posture:

- **passwords** hashed with bcryptjs at cost factor 12.
- **login** rate-limited to 10 attempts per 15 minutes per IP, in-memory.
- **sessions** are opaque random UUIDs in the `sessions` table; cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. 90-day expiry, swept nightly.
- **password change** rotates every session for that user — all other devices have to sign in again.
- **CSRF** defended by an `Origin` header check on mutations (active only when `DOMAIN` is set).
- **API tokens** for the iOS Shortcut webhook are stored only as SHA-256 hashes; rate-limited to 60 requests per minute per token.
- **push subscription endpoints** are allowlisted to known push-service hosts (FCM, Mozilla, Microsoft, Apple, Windows Notify) to block SSRF.
- **service worker** does not cache `/api/*` — caching authenticated responses risks leaking one user's data to the next on shared devices.

please report vulnerabilities privately via GitHub Security Advisories on this repository rather than opening a public issue.

## License

MIT. see [LICENSE](LICENSE).
