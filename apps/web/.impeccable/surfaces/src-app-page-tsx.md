---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/people/page.tsx","src/app/people/[id]/page.tsx"]
---

# Admin app shell: Overview, People, Person

Scope: the signed-in admin UI (app shell, Overview at `/`, People at `/people`, Person at `/people/[id]`). Visitor mode: **Operate**. The setup wizard, login and later screens inherit this world.

Audience and job: the server owner, a weekly check-in on a phone or desktop. "How is my audience doing, and is there anything I need to decide?" The Overview leads with the audience pulse plus a Housekeeping list. The owner rejected any Tautulli/Grafana look and anything corporate or cold, and asked for less gimmick and plain words.

Plain status labels (UI copy; the internal ids stay the same): New · Active · Slowing down (30–90 days) · Gone quiet (90–180 days) · Inactive (6+ months) · Never watched · Invite pending · Removed · Owner.

Unresolved: newsletter and library screens (later phases); the person-page actions nudge and remove arrive in P4; in P1 Housekeeping links to filtered People views.

## Direction contract

THESIS: The attendance register. Every person is a row and every week is a mark, so who has been around, and who has drifted, reads at a glance. It refuses the KPI-tile dashboard: no stat cards; numbers live in sentences and ruled summary lines.

OWN-WORLD: A ruled register on a white ground (cool paper-white, with hairline rules) under a deep register-cover blue rail. Marks are set in register-blue ink. Red ink is reserved for things that need the owner's decision. Status chips are ink-mark glyphs with plain labels (filled, half, outline, dashed, struck). Column heads are condensed printed caps; names and body text use a warm humanist grotesk; every number is set in tabular figures. In dark mode the paper becomes a blue-black and the ink lightens.

STORY: The owner sees how many people watched this week and how that compares, scans what needs them, then reads the register of people who need attention and opens anyone in one tap.

FIRST VIEWPORT: The rail is on the left. At the top is a sentence line, "12 of 41 people watched this week, 3 more than last week", with a range control (7 d, 30 d, 90 d) and a 12-week sparkline. The left two-thirds holds the register: the people who need attention, each with 12 week-columns of marks, a status label and the last thing they watched. The right third holds Housekeeping: plain sentences with counts and one action each, red only for decisions. The peak-hours grid and weekly plays bars start below the fold.

FORM: Attendance register, position 1 on the round-two grounded list, user-chosen as IMPECCABLE'S PICK. seed: 94809c28e693e6e6. Signature move: the register strip. One shared weekly scale, identical on Overview, People and the Person page (52 weeks there). A mark's fill encodes that week's hours; hovering a mark shows the week, plays, hours and top title. Motion: marks ink in left to right once, when the range changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
