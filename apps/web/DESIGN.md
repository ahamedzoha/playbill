---
name: Playbill
description: The admin register for a shared Plex server, where every person is a row and every week is a mark.
colors:
  paper: "#f3f5f9"
  sheet: "#ffffff"
  ink: "#14171f"
  ink-2: "#4b5263"
  ink-3: "#626a7b"
  rule: "#e2e6ee"
  rule-strong: "#c9d0dc"
  rail: "#1b2c57"
  rail-ink: "#eef2fb"
  rail-ink-2: "#aebbd9"
  rail-hover: "#22376a"
  rail-active: "#2b4384"
  action: "#1b2c57"
  action-ink: "#eef2fb"
  action-hover: "#2b4384"
  blue: "#256abf"
  blue-wash: "#eaf2fd"
  red: "#c4373a"
  red-wash: "#fcefee"
  mark-0: "#e6eaf1"
  slot-line: "#b9c1cf"
  mark-1: "#86b6ef"
  mark-2: "#3987e5"
  mark-3: "#1c5cab"
  mark-4: "#0d366b"
  dark-paper: "#0e1218"
  dark-sheet: "#151a22"
  dark-ink: "#ecf0f6"
  dark-ink-2: "#b3bccb"
  dark-ink-3: "#939dae"
  dark-rule: "#252c38"
  dark-rule-strong: "#343d4c"
  dark-rail: "#0f1a34"
  dark-rail-ink: "#e6ebf7"
  dark-rail-ink-2: "#94a2c4"
  dark-rail-hover: "#16244a"
  dark-rail-active: "#1f3266"
  dark-action: "#3a62b8"
  dark-action-ink: "#f3f6fc"
  dark-action-hover: "#4269bf"
  dark-blue: "#6da7ec"
  dark-blue-wash: "#152238"
  dark-red: "#ec7070"
  dark-red-wash: "#2b181b"
  dark-mark-0: "#1f2631"
  dark-slot-line: "#6b7588"
  dark-mark-1: "#184f95"
  dark-mark-2: "#2a78d6"
  dark-mark-3: "#5598e7"
  dark-mark-4: "#9ec5f4"
typography:
  display:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  display-wide:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  caption:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  label:
    fontFamily: "Barlow Condensed, Hanken Grotesk, ui-sans-serif, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  label-tick:
    fontFamily: "Barlow Condensed, Hanken Grotesk, ui-sans-serif, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  figures:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "inherit"
    fontFeature: "\"tnum\" 1"
rounded:
  mark-key: "3px"
  mark: "0.24em"
  bar: "4px"
  segment: "6px"
  control: "8px"
  sheet: "12px"
  pill: "9999px"
spacing:
  hair: "2px"
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "24px"
  xl: "32px"
  page-phone: "16px"
  page-tablet: "32px"
  page-desktop: "40px"
  rail: "240px"
components:
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "20px"
  sheet-wide:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "24px"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-ink}"
  link-action:
    textColor: "{colors.blue}"
    typography: "{typography.body-sm}"
  link-decision:
    textColor: "{colors.red}"
    typography: "{typography.body-sm}"
  range-control:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "2px"
  range-segment:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.segment}"
    padding: "6px 12px"
  range-segment-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  range-segment-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
  filter-chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  filter-chip-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  nav-item:
    textColor: "{colors.rail-ink-2}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  nav-item-hover:
    backgroundColor: "{colors.rail-hover}"
    textColor: "{colors.rail-ink}"
  nav-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.rail-ink}"
  tab-item:
    textColor: "{colors.ink-3}"
    typography: "{typography.caption}"
    padding: "10px 0"
  tab-item-active:
    textColor: "{colors.blue}"
  tooltip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  register-mark:
    backgroundColor: "{colors.mark-2}"
    rounded: "{rounded.mark}"
    size: "12px"
  register-mark-person:
    backgroundColor: "{colors.mark-2}"
    rounded: "{rounded.mark}"
    size: "16px"
  avatar:
    backgroundColor: "{colors.blue-wash}"
    textColor: "{colors.blue}"
    rounded: "{rounded.pill}"
    size: "32px"
---

# Design System: Playbill

## Overview

**Creative North Star: "The Attendance Register"**

Playbill's admin UI is a ruled register on cool paper-white, bound under a deep register-cover blue rail. Every person is a row and every week is a mark, so who has been around and who has drifted reads at a glance. The register strip, one square mark per week on one shared weekly scale, is the world's repeated form: it appears at 12 weeks on Overview and People, at 52 weeks (four 13-week quarters) on a person's page, as the peak-hours grid, and even as the two-row wordmark beside the product name.

The surface is calm and dense, the density of a well-kept ledger rather than a dashboard. Numbers live in sentences ("12 of 41 people watched in the last 7 days") and in ruled tables, never in stat tiles. Sheets are flat white with hairline rules; column heads are condensed printed caps; names and prose are set in a warm humanist grotesk. Colour is almost entirely one blue ink, stepped by how much someone watched; red ink is held back for the owner. In dark mode the paper becomes a blue-black, the rail deepens, and the ink ramp inverts so the strongest week is still the most visible mark.

Motion has one gesture: when the range changes, marks ink in from left to right (420ms, 18ms stagger per mark), and it is switched off under reduced motion.

**Key Characteristics:**
- One shared weekly scale, drawn as rounded square marks in an ordinal blue ramp, everywhere attendance appears.
- One state-mark vocabulary for status: filled, half, outline, dotted, dashed, struck, plus the open "not yet joined" slot.
- Activity events reuse the same square for their level: filled red = error, half red = warning, ink-3 outline = info. Red still means "the owner should look".
- Flat white sheets with hairline borders on a cool grey paper; shadow only on floating tooltips.
- Condensed uppercase caps for column heads and tick labels; humanist grotesk for everything a person reads.
- Tabular figures for every number, so columns of counts and hours align like a ledger.
- Red only where the owner has to act.

## Colors

A cool, nearly monochrome blue world: paper-white sheets, slate inks, a navy rail, one blue ink ramp for the data, and a single red reserved for the owner.

### Primary
- **Register Ink Ramp** (`mark-1` to `mark-4`): the ordinal scale for a week's watching, light to dark in light mode: under 1 h, 1-3 h, 3-8 h, 8 h+. The same four steps fill register marks, the peak-hours grid (quantiles of non-zero cells), the weekly bars (`mark-2`, `mark-4` on hover) and the people-watching history (`mark-2`, current week `mark-4`). Validated with the dataviz validator as an ordinal ramp on white; the dark ramp (`dark-mark-1` to `dark-mark-4`) runs dark-to-light on the blue-black sheet so "more" is always "more contrast".
- **Register Blue** (`blue`): interactive ink: action links ("See all 14 in People"), focus rings, the active tab in the phone tab bar, input focus borders, checkbox accent. `focus` is the same value.
- **Blue Wash** (`blue-wash`): the initials disc behind a person's avatar.

### Secondary
- **Register-Cover Navy** (`rail`): the desktop side rail and phone top bar. `rail-hover` and `rail-active` are its two raised steps; `rail-ink` and `rail-ink-2` are its primary and muted text.
- **Action** (`action`): the solid fill for the one primary action per form and for selected states (active range segment, active filter chip, active tab, the chosen email provider); `action-hover` on hover, `action-ink` its text. In light mode it is the rail navy. In dark mode it is a brighter blue (`dark-action`), because the dark rail navy sits too close to the dark sheet to read as a button; white on it keeps about 5:1.

### Tertiary
- **Decision Red** (`red`): ink for what needs the owner: the filled square and action link of a Housekeeping item that is a decision, a connection that is down in Settings, and a save or sign-in that failed. `red-wash` is its quiet ground.

### Neutral
- **Cool Paper** (`paper`): the page ground behind sheets, the hover wash on table rows (at 60%) and range segments.
- **Sheet White** (`sheet`): every container, tooltip, input and the phone tab bar (at 95% with blur).
- **Register Ink** (`ink`): names, headings, primary values.
- **Second Ink** (`ink-2`): supporting sentences, status labels, secondary table cells.
- **Third Ink** (`ink-3`): column heads, captions, keys, placeholder text, inactive tab icons; also the stroke of the grey state marks (inactive, never, removed).
- **Hairline Rule** (`rule`): sheet borders, row dividers, input and chip borders.
- **Strong Rule** (`rule-strong`): the ruled line above and below every table head, the bar-chart baseline, month ticks, scrollbar thumbs.
- **Empty Slot** (`mark-0`): a week with no watching, and the lowest peak-grid step.
- **Slot Line** (`slot-line`): the 1px inset outline of a week before the person joined; drawn, never filled.

### Named Rules
**The One Ink Rule.** Attendance and volume are only ever drawn in the `mark-0` to `mark-4` ramp. No second hue, no gradient, no categorical palette; a mark's darkness is its quantity.

**The Owner's Red Rule.** Red appears only where the owner must act: a removal or warning awaiting their decision, or something broken they must fix. It is never decoration, never a trend colour, never an "inactive" signal. A screen with nothing for the owner to do has no red on it.

**The Shared Scale Rule.** The four hour bands (under 1 h, 1-3 h, 3-8 h, 8 h+) mean the same thing on every page, and every register carries its key.

## Typography

**Display Font:** Hanken Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Hanken Grotesk
**Label Font:** Barlow Condensed, weights 500 and 600 (falls back to Hanken Grotesk)

**Character:** A warm humanist grotesk carries every sentence and name, so the register reads as written about people; a condensed printed caps face carries the ruled column heads, so the structure reads as printed. Both are self-hosted by next/font.

### Hierarchy
- **Display** (600, 1.75rem rising to 2.25rem from 640px, line-height 1.15, -0.025em, balanced, max 30ch): the page's sentence headline ("12 of 41 people watched in the last 7 days"), a person's name, "Settings". One per page.
- **Title** (600, 1.125rem, -0.01em): sheet headings ("People to check on", "Housekeeping", "When people watch").
- **Body** (400, 1rem): summary sentences under the headline, max 70ch; a person's lede is set one step up at 1.125rem in `ink-2`.
- **Body Small** (400 / 500, 0.875rem): table cells, status labels, links, buttons, inputs, tooltips. Names in tables are 500.
- **Caption** (400, 0.75rem): register keys, chart captions, "Last 90 days", sync notes, tab-bar labels.
- **Label** (Barlow Condensed 600, 0.8125rem, uppercase, 0.06em, line-height 1): table column heads, tooltip date lines, quarter labels over a person's year.
- **Label Tick** (Barlow Condensed 600, 0.625rem to 0.6875rem, uppercase): month ticks and the "Now" tick over register columns, weekday labels on the peak grid.

### Named Rules
**The Ledger Figures Rule.** Every number is set in tabular figures (the `num` utility, `font-variant-numeric: tabular-nums`): headline counts, range segments, filter counts, plays, hours, dates, axis labels.

**The Printed Head Rule.** Condensed caps are for structural labels that sit over or beside data (column heads, ticks, tooltip date lines). Never for sentences, names, buttons or headings.

## Layout

On screens 1024px and up, the frame is a two-column grid: a sticky 15rem (240px) register-cover rail holding the wordmark, server name, navigation, and the admin's avatar, theme switch and sign-out at its foot; then the main column, padded 40px. Below 1024px the rail becomes a slim navy top bar (wordmark, server, compact theme switch) and a fixed bottom tab bar of three items for thumb use; the main column pads 16px on phones and 32px from 640px, with 112px of bottom padding to clear the tab bar.

Pages open with a header row: the sentence headline and its summary line on the left, and on Overview the 12-week people-watching history and range control on the right, wrapping beneath on narrow screens. Sheets start 32px below and sit 24px apart. From 1280px Overview splits into the register (fluid) and Housekeeping (23rem); the person page splits into its year and history (fluid) and a 22rem aside; below 1280px Housekeeping moves above the register so decisions come first on a phone.

Inside sheets, padding is 20px, 24px from 640px; table rows are 12px tall in padding with 12px between cells. Tables shed columns by breakpoint instead of scrolling: status from 768px, the register strip from 640px (on phones it drops beneath the name, indented to the text, with marks at 13px), last watched from 1024px, plays and hours from 1280px, libraries and "since" from 1536px.

Mark size is set by a `--mark` custom property so a parent can resize a whole strip: 12px in tables, 13px on phones, 15-16px on a person's page. Mark gap is 0.22 of the mark size.

## Elevation & Depth

The system is flat. Depth is a declaration made once: a sheet is white on cool paper with a 1px `rule` border, and nothing at rest casts a shadow. Hierarchy inside a sheet comes from rules, not layers: a `rule-strong` line above and below each table head, `rule` hairlines between rows. The rail is a flat navy plane; the phone tab bar is a 95% white sheet with a backdrop blur and a top hairline.

### Shadow Vocabulary
- **Tooltip lift** (`box-shadow: 0 1px 2px rgb(20 23 31 / 0.04), 0 6px 18px -8px rgb(20 23 31 / 0.12)`; dark: `0 1px 2px rgb(0 0 0 / 0.3), 0 8px 24px -10px rgb(0 0 0 / 0.5)`): the floating readouts over register marks, peak-grid cells, weekly bars and the history sparkline. These are the only shadows in the product.

### Named Rules
**The Border-Not-Shadow Rule.** Sheets are bordered, never shadowed. A shadow means "this is floating over the page, briefly"; only tooltips earn it.

## Shapes

Corners are softened, never sharp and never blobby, and they step with size: 3px on key swatches and peak cells, 0.24 of the mark size on register marks (so a mark stays the same shape at every size), 4px on bar tops and the strip's focus outline, 6px on range segments, 8px on buttons, inputs, nav items and tooltips, 12px on sheets. Fully round is for things that are tokens of a person or a filter: avatars, filter chips and the "Exempt" tag.

The rounded square is the world's one silhouette. Register marks, status marks, the Housekeeping bullet, key swatches, peak-grid cells and the wordmark are all the same rounded square. Lines are 1px hairlines; state marks stroke at 1.5px.

## Components

### Buttons
Few and quiet: the product acts through links in sentences more than through buttons.
- **Shape:** gently rounded (8px).
- **Primary:** register-cover navy fill with `rail-ink` text, 0.875rem medium, 8px by 16px ("Save" on a person's note). One per form.
- **Hover / Focus:** fill steps to `rail-active`; focus is the global 2px `blue` outline at 2px offset. Disabled drops to 60% opacity.
- **Action links:** 0.875rem medium in `blue` with a trailing arrow icon, underlined on hover; the decision variant is the same in `red`.

### Range Control
- **Style:** a segmented control of links (7, 30, 90 days) in an 8px bordered white track with 2px inset; segments are 6px rounded, 6px by 12px, tabular figures.
- **State:** active segment is filled navy with `rail-ink` text; others are `ink-2`, hovering to a paper wash. The range lives in the URL.

### Chips
- **Style:** fully round filter chips, 6px by 12px, white with a `rule` border and `ink-2` label, each with its status mark (10px) and a tabular count in `ink-3`.
- **State:** selected fills navy with a navy border, `rail-ink` label and `rail-ink-2` count; hover darkens the border to `rule-strong`.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `sheet` on `paper`.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px `rule`.
- **Internal Padding:** 20px, 24px from 640px; list and table sheets put the heading in a padded band and let rows run edge to edge.

### Inputs / Fields
- **Style:** 8px rounded, 1px `rule` border, white (the note textarea sits on a 50% paper wash), 0.875rem text, `ink-3` placeholder. The search field carries a 16px search icon inset at 12px.
- **Focus:** border turns `blue`; the outline is suppressed in favour of the border.
- **Error:** the message beside the action is `red`; success messages are `ink-3`.

### Navigation
- **Rail:** items are 0.9375rem with an 18px icon, 8px by 12px, 8px rounded; idle `rail-ink-2`, hover `rail-hover` fill with `rail-ink`, current page `rail-active` fill with `rail-ink`.
- **Phone tab bar:** three equal columns, 20px icon over a 0.75rem label; idle `ink-3`, current page `blue` with a heavier icon stroke. Navigation only lists sections that exist.

### Register Strip (signature)
One rounded square per week, filled from the ink ramp by that week's hours; a week without watching is `mark-0`; a week before the person joined is an open slot with a 1px `slot-line` inset outline. Above it, a printed head of month ticks (caps, `ink-3`, a 4px `rule-strong` tick where a month starts) and a "Now" tick over the current week, so marks read as ruled columns. Below every register sits its key. Hovering or tapping a mark outlines it in 2px `ink` and raises a tooltip with the week (caps), plays and hours, and the top title. The strip is one tab stop; arrow keys, Home and End step through weeks and the readout is announced. Marks ink in left to right when the range changes.

### Status Mark
The same rounded square states a person's segment, so shape carries meaning without colour: **filled** `mark-3` for active and owner; **filled light** `mark-1` with a `mark-2` stroke for new; **half** for slowing down; **outline** `mark-2` for gone quiet; **outline** `ink-3` for inactive 6+ months; **dotted** `ink-3` for never watched; **dashed** `mark-2` for invite pending; **struck** `ink-3` for removed. Always paired with a plain `ink-2` label; an optional round "Exempt" tag follows.

### Tooltip
White sheet, 1px `rule` border, 8px rounded, 8px by 12px, the tooltip lift shadow; a caps date line in `ink-3`, then a 500-weight value line and an `ink-2` detail line. Positioned above its mark, centred.

### Avatar
A round initials disc (`blue-wash` ground, `blue` initials at 0.38 of the size, 1px `rule` ring) with the Plex photo laid over it when one loads; on the rail it uses `rail-active` with a faint white ring.

## Do's and Don'ts

### Do:
- **Do** draw any per-week or per-hour quantity as rounded-square marks in the `mark-0` to `mark-4` ramp, on the shared hour bands, with a key.
- **Do** state a person's segment with the status-mark vocabulary (filled, half, outline, dotted, dashed, struck, open slot) plus a plain label.
- **Do** put numbers in sentences and ruled tables, and set every number with tabular figures.
- **Do** separate content with 1px `rule` hairlines and a `rule-strong` line around table heads.
- **Do** use `rail` navy for the single primary action and for selected states.
- **Do** keep column heads and ticks in Barlow Condensed caps at 0.8125rem / 0.06em, and everything else in Hanken Grotesk.
- **Do** honour reduced motion: the ink-in animation is the only motion and it switches off.

### Don't:
- **Don't** build KPI stat tiles or big-number cards; the headline is a sentence.
- **Don't** use red for anything other than an owner decision or a failure the owner must fix.
- **Don't** introduce a second data hue or a categorical palette for attendance.
- **Don't** put a shadow on a sheet, card or panel; shadows are for tooltips only.
- **Don't** signal state by colour alone; the mark's shape must carry it.
- **Don't** set sentences, names or buttons in condensed caps.
