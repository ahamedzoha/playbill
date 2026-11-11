---
name: Playbill Emails
description: Every recipient email is printed like a cinema one-sheet, ink-black with paper-white condensed billing and one gold.
colors:
  ink: "#0c0c0e"
  paper: "#f1ede4"
  note: "#d9d4c9"
  bill: "#8f8a80"
  link: "#b3ada0"
  rule: "#2a2a2e"
  rule-strong: "#4a4740"
  well: "#1c1c20"
  gold: "#e0b04a"
typography:
  sheet-title:
    fontFamily: "'HelveticaNeue-CondensedBlack', 'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: "55px"
    letterSpacing: "0.01em"
  date-line:
    fontFamily: "'HelveticaNeue-CondensedBlack', 'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: "32px"
    letterSpacing: "0.07em"
  button:
    fontFamily: "'HelveticaNeue-CondensedBlack', 'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 900
    lineHeight: "20px"
    letterSpacing: "0.2em"
  row-title:
    fontFamily: "'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "19px"
    letterSpacing: "0.05em"
  billing:
    fontFamily: "'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "17px"
    letterSpacing: "0.06em"
  section-heading:
    fontFamily: "'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.26em"
  greeting:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "25px"
  footer:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "19px"
rounded:
  none: "0px"
spacing:
  gutter: "22px"
  column: "600px"
  lead-poster: "440px"
  poster-row-gap: "12px"
  section-gap: "40px"
components:
  gold-button:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "16px 12px"
  date-line:
    textColor: "{colors.gold}"
    typography: "{typography.date-line}"
    padding: "16px 0 0"
  poster-row:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.row-title}"
    padding: "12px 0"
    width: "48px"
    height: "72px"
  poster-well:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.none}"
---

# Design System: Playbill Emails

Playbill's recipient emails are their own world, "The One-Sheet", deliberately separate from the admin app's world (Attendance Register, `apps/web/DESIGN.md`). Recipients never see the admin UI, and the two do not share tokens.

## Overview

**Creative North Star: "The One-Sheet"**

Each email is printed like a theatrical poster's billing: the week's headline title as a poster, the server's name in the credit block, and everything below as smaller one-sheets. The field is ink-black edge to edge, type is paper-white, credits are billing grey, and a single gold marks the date line, right-hand dates and status, and the button. It refuses the streaming-service hero banner over an even poster grid and the plain light newsletter card.

The reader is a friend or family member of the owner, on a phone, glancing, and the job is to feel like watching tonight. Density comes from condensed caps in small sizes; warmth comes from the owner's own words in a plain sans. The look is designed dark (`color-scheme: light dark` meta, no light variant).

**Key Characteristics:**
- Ink field, 600px column, no outer card.
- Every title carries a poster; none are text-only.
- Condensed caps for billing, headings, dates and titles; plain sans only for the owner's voice.
- Hairline rules instead of containers; no cards, no rounded corners, no shadows.
- System fonts only, by design: a web font would tell a font host every time an email is opened.

## Colors

A near-monochrome ink and paper palette with one warm gold, like a printed one-sheet.

### Primary
- **Marquee Gold** (`{colors.gold}`): the date line, right-hand dates and status words in poster rows, and the Open Plex button fill. Nothing else.

### Neutral
- **Ink** (`{colors.ink}`): the field behind everything; also the text on the gold button and the colour the lead poster fades into.
- **Paper** (`{colors.paper}`): titles, the sheet title, facts in the billing block, signature.
- **Note Paper** (`{colors.note}`): the owner's note and sign-off body copy, a step down from paper.
- **Billing Grey** (`{colors.bill}`): credits, details, section headings, footer text.
- **Link Grey** (`{colors.link}`): underlined links in body and footer.
- **Rule** (`{colors.rule}`): hairlines between poster rows and above the footer.
- **Strong Rule** (`{colors.rule-strong}`): hairlines above the date line and section headings.
- **Poster Well** (`{colors.well}`): placeholder behind posters while they load, and for a missing poster.

### Named Rules
**The One Gold Rule.** Gold appears only on the date line, right-aligned dates/status, and the button. If it is not a date or the action, it is not gold.

## Typography

**Display / Billing Font:** system condensed stack, Helvetica Neue Condensed on Apple, Arial Narrow on Windows, Roboto Condensed on Android, then Helvetica Neue / Arial (`NARROW`, with `NARROW_HEAVY` leading with the Black cut).
**Body Font:** system sans (`FONT`): -apple-system, Helvetica Neue, Segoe UI, Roboto, Arial.

**Character:** a poster's billing block: tall, tight, uppercase, heavily tracked at small sizes. The plain sans keeps the owner's words human. No web fonts ever; the Arial fallback was checked and holds the layout.

### Hierarchy
- **Sheet title** (900, 56px / 46 / 36 / 30 by title length, line-height 0.98, +0.01em, caps, centred, balanced): the lead title; shrinks so it wraps at most three lines.
- **Date line** (900, 28px / 23 / 20 by length, +0.07em, caps, gold, centred): the one gold statement under the billing, between hairlines.
- **Button** (900, 17px, +0.2em, caps, ink on gold).
- **Row title** (700, 15px, +0.05em, caps, paper): poster rows; grid captions are 14px (feature) and 12.5px (three-up).
- **Billing** (700, 11px, 17px line, +0.06em, caps, grey, centred, max 380px): the credits block; facts in paper.
- **Section heading** (700, 12px, +0.26em, caps, grey) over a strong hairline.
- **Greeting** (700, 24px, -0.02em) and **Body** (400, 16px / 25px, note paper): the owner's voice.
- **Footer** (12px / 19px grey; "Sent with Playbill" 11px).

### Named Rules
**The Billing Rule.** Caps and tracking belong to credits, headings, dates and titles; sentences the owner would say aloud are sentence-case sans.

**The System Stack Rule.** Name stacks, never a hosted font. Test every type change against plain Arial.

## Layout

A 600px centred column on an ink field (Outlook gets a 600px conditional table in place of `max-width`). Side padding is 22px for everything below the lead poster. The lead poster is full-bleed on phones and a 440px one-sheet centred on desktop, 4:5, faded into the ink at the bottom and sides.

The lead is the newest release that has a poster: films beat series, and a later year beats an earlier one. Reading order: poster, title, billing, gold date line, greeting and note, full-width gold button, then the rest of the week.

Every title carries a poster, in a fixed ladder:
- **Lead:** 440px wide, 4:5.
- **Two-up feature row:** 260px posters, 2:3, 14px gap, large caption.
- **Three-up:** 160px posters, 2:3, 16px of gaps shared across columns so posters stay equal.
- **Poster rows:** 48x72 poster, 15px caps title, grey detail, optional gold right-hand date or status; used for coming soon, arrived requests, recap, leaving soon and account emails.

Sections are separated by a strong hairline with a 40px top gap. Posters shrink to their column on phones and stop at their size on desktop.

## Elevation & Depth

Flat. No shadows, no cards, no tonal surfaces. Depth is the lead poster fading into the ink and hairline rules between groups.

### Named Rules
**The No Cards Rule.** Group with a hairline and space, never a box, fill or radius.

## Shapes

Square and printed. Zero radius everywhere, full-width rectangular button, rectangular posters, 1px hairlines (`{colors.rule}` between rows, `{colors.rule-strong}` over headings and the date line).

## Components

### Buttons
- **Shape:** full-width rectangle, no radius.
- **Primary (Open Plex):** gold fill on the table cell (with `bgcolor` for Outlook) and the link filling it, ink 17px black caps at +0.2em, 16px 12px padding. One per email.
- **States:** none; email links carry no hover treatment.

### Lead one-sheet
Poster, then sheet title, billing block, and gold date line ("Now on the server"; "Coming soon" or "Back next week" on a quiet week with no poster).

### Poster row
48x72 poster, caps title, grey caps detail, gold right-aligned date or status. Hairline above every row but the first.

### Poster grid
Two-up feature then three-up rows, each poster over a caps caption and grey detail.

### Section heading
Grey tracked caps over a strong hairline: "Also new this week", "Coming soon", "Requests that arrived".

### Footer
Hairline, 12px grey reason line with underlined link-grey links, then "Sent with Playbill".

## Do's and Don'ts

### Do:
- **Do** give every title a poster; use the ladder lead, 260px, 160px, 48x72 row.
- **Do** keep gold to the date line, right-hand dates/status and the button.
- **Do** group with hairlines and space only.
- **Do** keep the Outlook markers (`data-pb-mso`), `bgcolor` on gold and ink cells, inline styles and tables.
- **Do** route all images through the signed image proxy (`fx: 'lead'` for the lead), and keep HTML under 102 KB.
- **Don't** add a web font, remote CSS or any asset that phones a third party.
- **Don't** wrap content in cards, rounded containers, fills or shadows.
- **Don't** use gold for decoration, links or headings.
- **Don't** reveal who requested what; stats are totals only.
- **Don't** rely on the dark look surviving every client: Gmail iOS may invert dark emails in dark mode. They stay readable but lose the look, which is an accepted limitation.
