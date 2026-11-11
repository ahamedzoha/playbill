# Progress

Read this first when resuming work. The plan, phases P0–P6, lives with the maintainer; this file
tracks what is built.

## P0 Foundation (in progress)

Done:
- **Repo structure:** pnpm workspace with `packages/core`, `apps/worker` and `apps/web` (Next 16,
  Tailwind v4).
- **Database:** Drizzle + better-sqlite3 in WAL mode with `synchronous=FULL`. The worker alone
  runs migrations, taking a backup first when the database already holds data.
- **Job queue:** lease-based, safe across the two processes. A claim is one
  `UPDATE … RETURNING`, a job whose lease expired is reclaimed, and a stale owner can't complete
  a job after someone else reclaimed it.
- **Scheduler:** a tick loop with croner used only to compute times. A missed occurrence runs on
  boot if it is within 6 h; older ones are skipped and logged.
- **Built-in jobs:** nightly backup (newest 7 kept) and maintenance.
- **Health:** worker heartbeat; `/api/health` reports the web and worker revisions and the
  heartbeat age.
- **Setup:** a one-time **setup code** (logged and written to `setup-code.txt`) is required before
  the first Plex sign-in. Then Plex PIN sign-in (the owner must own a server), server choice
  (tries every plex.tv connection plus an optional manual URL and checks the machine id), and a
  Tautulli test (checks it watches the same server).
- **Sessions:** cookie holding a random token, with only its SHA-256 stored; 30-day sliding
  expiry. `proxy.ts` makes an optimistic cookie check; pages and routes validate against the
  database.
- **Encryption:** AES-GCM for stored secrets; HMAC signing for links.
- **Docker:** one image, a supervisor that migrates then runs the worker and web, PUID/PGID,
  HEALTHCHECK. CI runs typecheck, test and build; the image workflow runs a smoke test (empty
  `/config` → healthy, setup code logged), then publishes multi-arch images (`edge` from main,
  semver and `latest` from tags).

- Published: public repo, `ghcr.io/ahamedzoha/playbill` (anonymous pull works).
- Optional auto-update timer in `deploy/auto-update/`. On the maintainer's server, a push to
  `main` was live about 9 minutes later, verified 2026-11-11 (`a0da3bb` → `3b6693b`).

Still to do in P0:
- [ ] Demo mode (`DEMO_MODE=1` with fixture data).
- [ ] Local break-glass password; trusted-header auth.

## P1 Insights (built, read-only)

- **Data:**
  - Synced people (Tautulli users merged with plex.tv friends, shares and invites), libraries,
    and watch history.
  - History uses Tautulli's grouped plays, keyed by `reference_id` and upserted.
  - Verified on the maintainer's server: 7,215 plays (Tautulli's grouped total); the top 3
    users' plays and hours match exactly; 47 people.
- **Lifecycle segments, in plain words:** New, Active, Slowing down (30–90 days), Gone quiet
  (90–180), Inactive 6+ months, Never watched, Invite pending, Removed, Owner.
- **Screens:**
  - Overview: a sentence-led pulse with a range control (7/30/90 days) and weekly-viewers bars;
    Housekeeping (red only for decisions); the "People to check on" register; peak hours;
    hours per week.
  - People: status chips with counts, search, sortable columns, a 12-week register strip per
    person.
  - Person: 52 weeks shown as four 13-week rows, with weeks before joining drawn as open slots;
    recent plays; access; most watched; devices; owner note and the exempt flag (stored only in
    Playbill, audited).
  - Settings: connections, read-only.
- **Design:**
  - Built with the impeccable skill on Opus: the "Attendance Register" world, chosen by the
    owner.
  - Records: `apps/web/PRODUCT.md`, `apps/web/DESIGN.md`, `apps/web/.impeccable/`.
  - The finish review passed after two fix rounds.

Still to do in P1: demo mode, so contributors and screenshots don't need a real server.

## Notes and gotchas

- Turbopack treats `new URL('…', import.meta.url)` as an asset import, so migration paths live in
  `packages/core/src/db/migrate.ts`, which the web bundle never imports.
- `next start` doesn't work with `output: standalone`; run `node .next/standalone/apps/web/server.js`.
- In Next 16, `middleware.ts` is `proxy.ts`.
- Helpers called by server components must not live in a `'use client'` module, or the page
  returns a 500. `withJoin` lives in `src/lib/register.ts` for this reason.
- An inline `<script>` in the root layout makes React 19 log a console error. The theme snippet
  uses `next/script` with `strategy="beforeInteractive"` instead.
- Plex invites (`/api/invites/requested`) often list the server by name only, with no machine
  id.
