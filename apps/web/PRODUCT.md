# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the Plex server owner.** A home-lab operator who shares their Plex Media Server with
roughly 10–100 friends and family. They open Playbill a few times a week, on a desktop or a phone,
to:
- see who is active and who is drifting;
- approve pending removals;
- plan or check the next newsletter.

They rarely deep-dive; the admin UI must answer "how is my server's audience doing, and is there
anything I need to decide?" quickly. Optional co-admins (Plex accounts the owner allows) do the
same job.

**Secondary: the owner's Plex users (recipients).** They never sign in to the admin UI. They see
only emails, the email web view, and the preferences/unsubscribe page.

## Product Purpose

Playbill keeps a Plex server's audience alive:
- it tells people what's new;
- it notices who is drifting away and nudges them back;
- it cleans up long-dead shares, with the owner's approval.

Success: the owner knows the state of their audience at a glance, recipients find the emails
worth opening, and no one is removed without the owner deciding it.

## Positioning

Tautulli records what happened and Plex lets you share. Playbill acts on both: relationship
management for a Plex server. It combines newsletters and new-arrival alerts with lifecycle
management of shares in one self-hosted tool, which neither Tautulli nor Plex's own user page
does.

## Operating Context

- **Install:** self-hosted, a single Docker image installed the way \*arr apps and Seerr are
  (`/config` volume, setup wizard).
- **Data sources:** Tautulli for history and users; plex.tv with the owner's token for shares,
  invites and libraries; optional Seerr/Overseerr and Sonarr/Radarr.
- **First-run setup:** setup code from the container logs → Sign in with Plex → pick the server →
  connect Tautulli.
- **Admin sign-in:** Plex sign-in for the owner and allowed admins.
- **Recipient links:** recipients reach public pages from links in emails, with no account.
- **Lifecycle segments:**
  - *new*: joined under 30 days ago
  - *active*: played in the last 30 days
  - *cooling*: 30–90 days since the last play
  - *dormant*: 90–180 days
  - *inactive*: over 180 days
  - *never*: never played
  - *pending*: invite not yet accepted
  - *removed*: share has ended
  - *owner*: the server owner

## Capabilities and Constraints

- **Insights:** plays and hours over time, active users over 7, 30 and 90 days, peak hours,
  direct play vs transcode, platforms and devices, library growth.
- **People directory and person page:** segments, last seen, activity over time, plays and
  hours, devices, libraries, an exempt flag, notes and labels; bulk actions (nudge, label,
  remove).
- **Lifecycle automation:**
  - A nudge at 60 days dormant, then a warning at 165 days; both are sent automatically.
  - Removal at 180 days is **queued for one-click owner approval and never automatic**.
  - Exempt people are skipped.
  - Every action is recorded in an audit log.
- **Planned:**
  - Newsletters (weekly digest; monthly personal recap).
  - New-arrival alerts, batched so ten episodes make one email.
  - Leaving-soon and removed notices.
  - Audiences: everyone, groups, individuals, smart rules.
  - Per-topic opt-out with one-click unsubscribe.
- **Email limits:** sending fits a free tier (Resend free is 100/day and 3,000/month), so
  emails are batched and capped.
- **Display:** must work in light and dark mode and at phone widths.
- **Privacy:** emails never reveal who requested what. Server stats in emails are totals only.
  A personal recap goes only to its own user.
- **Stack (existing):** Next 16 App Router and Tailwind v4 in `apps/web`; SQLite; one container
  running the web app and a worker.
- **Open source:** MIT licence, public repo `github.com/ahamedzoha/playbill`.

## Brand Commitments

- **Name:** Playbill.
- **The owner's words:** the admin UI should be "pleasing, modern, interactive", with "better
  user management than Plex".
- **Not Plex or Seerr:** the app should feel at home among self-hosted media tools without
  copying their branding.
- **Email voice: personal, from the owner.** Emails and public pages read like a note from the
  server owner to friends ("Hey Ann, three new films landed this week"), signed by the owner.
  Playbill stays invisible to recipients except for a small footer.

## Evidence on Hand

- **Real data from the first install** (the maintainer's server, Tautulli v2.18.2):
  - 48 Tautulli users; 42 plex.tv friends, with 41 shares and 1 pending invite;
  - 12 users active in the last 30 days;
  - about 10,149 plays;
  - 4 libraries: Movies 275, TV Shows 64, Music 378, Courses 924.
- **No testimonials, user counts beyond this install, or public adoption yet.** Don't invent
  any.

## Product Principles

1. **The owner decides; Playbill proposes.** Anything that removes access or contacts people at
   scale is visible, explainable and approval-gated where it is irreversible.
2. **Answer the weekly question first.** Every admin screen leads with what changed and what
   needs a decision, before exhaustive detail.
3. **People, not rows.** Users are friends and family; show them as people with a story
   (joined, active, drifting), not as database records.
4. **Personal over promotional.** Anything a recipient sees should feel like a friend sharing
   news, never like marketing.
5. **Self-host friendly** *(inferred from the open-source, self-hosted brief; not yet confirmed
   by the owner)*. Everything runs from the owner's server. Pages and emails don't depend on, or
   report to, third parties beyond the services the owner configured (Plex, Tautulli, the email
   provider), and it holds up on a small server.
