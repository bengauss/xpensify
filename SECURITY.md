# Security policy

## Supported versions

xpensify is a small self-hosted app with a single `master` branch. Security fixes land on `master`; please run a recent build.

## Reporting a vulnerability

Please report vulnerabilities **privately** via GitHub Security Advisories on this repository ("Security" tab → "Report a vulnerability") rather than opening a public issue. If you cannot use Security Advisories, email the maintainer listed on the GitHub profile.

Please include:

- a description of the issue and its impact
- steps to reproduce (or a proof-of-concept)
- the commit / version affected (the `v2.x` label in `client/src/screens/Settings.tsx` is the build-stamp users see)

## Scope

In scope:

- the server (Hono routes, auth, sync, Apple Pay webhook, push, recurring jobs)
- the client (PWA, service worker, IndexedDB-resident data)
- the Docker image build

Out of scope:

- attacks that require shell access to the host running xpensify
- attacks against users who share a household account on purpose (xpensify is single-tenant by design — everyone signed in sees the whole ledger)
- denial-of-service via flooding (the login limiter is best-effort; the deployer is expected to put xpensify behind a reverse proxy / CDN)

See the **Security** section of the [README](README.md) for the current posture (bcrypt cost, session cookie flags, CSRF Origin check, push endpoint allowlist, etc.).
