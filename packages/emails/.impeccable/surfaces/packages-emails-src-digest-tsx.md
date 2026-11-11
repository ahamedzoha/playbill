---
version: 1
slug: "packages-emails-src-digest-tsx"
primary_target: "packages/emails/src/digest.tsx"
related_targets: ["packages/emails/src/arrivals.tsx","packages/emails/src/recap.tsx","packages/emails/src/leaving.tsx","packages/emails/src/lifecycle.tsx"]
---

# Surface: Playbill recipient emails (weekly digest first)

Scope: the HTML emails Playbill sends to the owner's Plex users — weekly digest first; arrivals, recap, leaving soon and account (lifecycle) emails share its shell. Mode: Persuade (the reader decides to open Plex tonight).

Audience: the owner's friends and family, mostly on phones in Gmail/Apple Mail, glancing. Job: know what landed on the server this week and feel like watching. Action: Open Plex. Constraints: HTML email (Gmail iOS/Android/web, Apple Mail, Outlook), tables and inline styles, no web fonts (privacy), images only through the signed /img proxy, HTML under 102 KB, personal voice from the owner, no invented claims, never reveal who requested what.

User answers (2026-11-11): own bolder look, not the admin app's; the week's biggest title leads, big; dark or light both allowed. Chose "The One-Sheet" from the direction round.

## Direction contract

THESIS: The week's headline title is printed as a theatrical one-sheet, the server's name in its billing block. Refuses the streaming-service hero banner over an even poster grid, and the plain light newsletter card.

OWN-WORLD: Ink-black field (#0c0c0e) end to end, paper-white type (#f1ede4), billing grey (#8f8a80), one gold (#e0b04a) for the date line, dates and the button. Narrow condensed caps for every billing, heading and date; a plain sans for the personal note. Hairline rules, no cards, no rounded containers.

STORY: The reader sees the poster, reads the billing block (presents, title, credits for the week), sees NOW ON THE SERVER, reads the owner's note, opens Plex; below, the rest of the week as small one-sheets, coming soon and arrived requests as date-line rows.

FIRST VIEWPORT: Headline poster full-bleed on phones (max 440px wide, centred on desktop), fading into the ink; under it the title in big condensed caps, a dense centred billing block, a gold NOW ON THE SERVER line, "Hey Ann," with the note, and the full-width gold Open Plex button.

FORM: The One-Sheet, candidate 1 of 7 on the ordered list (the pick card), seed:3535a66eaa5ddb19.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
