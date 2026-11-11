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
  `/config` → healthy, setup code logged), then publishes multi-arch images (`edge` from main, amd64 only;
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

## P2 Weekly digest, P3 New arrivals, P4 People management (built)

- **Activity** (`/activity`): one stream of every admin action, automatic decision, send and
  failure, with a level (error, warning, info) and a category. Search with `actor:` `type:`
  `is:` `action:` tokens, a time range with a volume chart (click a bar to zoom), j/k keys and a
  live "new events" bar. Each event has its own page: before → after, a send's deliveries and
  provider events, and what happened around it. Kept for 2 years or 2 GB of log data, whichever
  comes first (nightly maintenance; oldest first).

- **Email design, "The One-Sheet"** (`packages/emails/DESIGN.md`): every email is printed like a cinema
  poster's billing on an ink field. The digest leads with the week's newest release as a poster
  (cropped and faded into the ink by the image proxy), then a two-tier poster grid; every title in
  every email carries a poster. System fonts only; an Outlook 600px conditional table and a
  bulletproof button.

- **Digest:**
  - Thursdays at 7 pm by default.
  - Sections: recently added, coming up, filled requests, totals.
  - Test mode and Go live need confirmation; previews show it as any person.
  - Quota guard; one-click unsubscribe; web view; signed image proxy.
- **Arrivals:**
  - A reconciler runs every 15 minutes; the first sync is backlog.
  - Batches wait 2 h (max 24 h) and skip quiet hours.
  - Episodes go to followers, films to everyone who wants them; requesters are skipped; at most
    one a day per person; arrivals are dropped when the allowance is short.
- **People management:**
  - Nightly rules (off by default): nudge at 60 days, warn at 165 with a 14-day deadline, propose
    removal at 180.
  - Approvals panel on People and Overview.
  - Person page: change libraries, nudge, remove (confirmed), re-invite from the saved share,
    withdraw an invite.
  - Every plex.tv write is audited.
- **plex.tv write endpoints** (from python-plexapi, unofficial):
  - Invite: `POST /api/servers/{machine}/shared_servers`, which takes plex.tv section ids.
    `GET /api/servers/{machine}` maps keys to ids.
  - Change libraries: `PUT /api/servers/{machine}/shared_servers/{shareId}`.
  - Remove: `DELETE /api/v2/sharings/{userId}`.
  - Cancel an invite: `DELETE /api/invites/requested/{id}?friend=0&home=0&server=1`.
- **Headless config:**
  `echo '{…}' | docker exec -i playbill node /app/worker/dist/worker.mjs config <general|email|integration>`.

- **Monthly recap (P5):** sent on the 1st at 10 am, personal numbers only, off and in test mode
  by default.
- **Library and Leaving soon (P6):**
  - Daily library sync from Tautulli, listing never-watched titles and titles not watched in a
    year, with sizes.
  - Plan a removal date; people who watched a title get one notice N days before, and the owner
    gets a reminder on the day. Playbill never deletes files.
  - Not built yet: "Removed" notices from Sonarr/Radarr delete webhooks, and per-library filters
    (for example, to hide a Courses library).

Still to verify live:
- Real email to the owner's own inbox: digest and arrivals tests, plus a mail-tester score.
- The plex.tv write calls, against a test Plex account the owner provides.

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
- React Email templates need `/** @jsxRuntime automatic */` at the top. Without it the worker,
  run under tsx or esbuild, compiles JSX the classic way and fails with "React is not defined".
- A `'use server'` file may export only async functions; exporting a constant from one crashes at
  runtime.
- Arrivals record their baseline in `sync_state`, not by checking whether the table is empty, so
  an empty first answer from Tautulli doesn't turn the next sync into backlog.
