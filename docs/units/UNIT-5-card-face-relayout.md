# UNIT 5: Relayout the card face into the requested lines

- **Plan unit:** 5 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R4
- **Commit(s):** _this unit's commit_ + follow-up commits (see "Follow-up
  refinement", "Second follow-up", and "Third follow-up" below)

## What changed

(Final state, after both follow-ups below — see those sections for the
sequence of changes that got here.)

- `apps/web/components/card/card.tsx` — restructured `CardFace`'s post-title
  content from two tiers (middle: project + severity + labels; bottom:
  priority + links left, due + checklist + id right) into four fixed lines:
  - **Line 1** — `card.shortId` (hand-placed, left) … `ml-auto` [due chip,
    checklist meter] (right). Always renders (it carries the ticket id). No
    archive affordance (removed — see "Second follow-up" below).
  - **Line 2** — status glyph + title (moved off the top row so line 1 leads).
  - **Line 3** — labels only (`config`-filtered to `["labels"]`); omitted
    entirely when the card has no labels.
  - **Line 4** — priority badge, then the link cluster (left), then
    `ProjectChip` pushed to the far right via `ml-auto`; omitted entirely
    when there's no priority, no links, and no project.
  - Renamed the tier key-sets: `MIDDLE_KEYS`/`BOTTOM_LEFT_KEYS`/`BOTTOM_RIGHT_KEYS`
    → `LABEL_KEYS`/`LINE3_KEYS`/`LINE1_RIGHT_KEYS`.
- `apps/web/components/card/project-chip.tsx` — added an optional
  `className` prop so the card face can push the chip right with `ml-auto`
  without a wrapper `<div>`.
- `apps/web/components/card/chip.ts` — dropped the stale "severity" mention
  from the shared-shell comment.
- `docs/design/DESIGN.md` — rewrote the card-face bullet (§8) to describe the
  four-line structure instead of the old single wrapped badge row; dropped
  the now-nonexistent "severity pill" mentions from §2 (color encodings, the
  whole `**Severity:**` paragraph), §1 (principle 5's field list), §7 (the
  shadcn-mapping table's "Labels / due / severity pickers" row), and §8 (the
  card-detail property list).
- `apps/web/components/card/card.test.tsx` — `describe("card face layout (Unit 5)")`
  block: 4 tests covering the full line structure + DOM order (updated for
  the follow-up reorder — see below), and each omission case.
- `packages/domain/src/badges.ts` — no change needed: `DEFAULT_BADGE_CONFIG`'s
  existing order (`status, priority, dueDate, labels, links, checklist`)
  already keeps `priority` before `links` and `dueDate` before `checklist`,
  matching the new lines' stated order.

## Follow-up refinement (post-ship, same day)

After this unit shipped and was verified, the user asked for two further
adjustments to the same card face, given directly in chat (not through a new
plan doc) and explicitly framed as a **locked-in ordering** — "I don't want
the feature to change this ordering anymore":

1. The title moves to its own line (line 2), instead of sharing the top row
   with the status glyph and archive button.
2. The archive button (hover-only) moves from the title row onto line 1,
   at the far right after the due/checklist nodes.
3. On the priority/links/project line, the project badge is pushed to the
   _far_ right (`ml-auto`) instead of just trailing the priority/link nodes.

This changed the DOM order from `[title row, line1, labels?, line3?]` to
`[line1, title row, labels?, line3?]`. `card.test.tsx`'s `metaRows` helper was
updated to splice out the title row at its new index (1) instead of index 0.
Applied directly (small, well-understood UI reorder) rather than re-running
`/ce:plan` — the code comment at the top of `card.tsx` and the DESIGN.md §8
bullet both now state the four lines explicitly so this ordering doesn't
drift in future work.

**Second follow-up, same day: the card-face archive button was removed.**
The hover-only archive button added by the reorder above was pulled back
out entirely, per direct user feedback ("remove the archive button in each
card for now"). Archiving a card is still possible via the card detail
drawer's "Archive card" button (`card-detail.tsx`) and the `e` keyboard
shortcut (`keyboard-nav.tsx`) — neither of those routes through `CardFace`,
so removing the card-face button doesn't touch either. Changes:

- `card.tsx` — dropped the `Archive` import, the `onArchive` prop, and the
  button; line 1's right-hand container now holds only
  `line1RightNodes`. Also dropped the now-unused `group`/`group-hover`
  classes from the `<article>` (nothing else uses the hover-reveal pattern).
- `dnd.tsx` (`SortableCard`), `column-cards.tsx`, `swimlanes.tsx` — removed
  the `onArchive` prop/callback threading that only existed to feed the
  removed button. `swimlanes.tsx` also dropped its now-unused
  `useCardActions()` call and import (it had no other use for `actions`).
- `card.test.tsx` — removed the `"archives a card"` test, which asserted on
  the now-removed `"Archive Bye"` button. Archive-from-keyboard coverage
  already exists independently in `keyboard-nav.test.tsx` (mocked handler,
  not dependent on `CardFace`'s DOM). No equivalent test exists yet for
  `card-detail.tsx`'s own Archive button — pre-existing gap, out of scope
  here.
- `docs/design/DESIGN.md` §8 — dropped the "hover-only archive button" clause
  from line 1's description; added a line noting archive lives in the detail
  drawer and the `e` shortcut, not the card face.

**Third follow-up: `LinkCluster` became one badge instead of one badge per
link, the due-date "soon" tier was dropped, and priority glyphs shrank.**
Given directly in chat, in three small commits (`6d158be`, `f6b427e`,
`ed9316c`):

- `link-cluster.tsx` — the cluster used to render each visible link as its
  own bordered/ringed circle. It's now one `CHIP`-shell badge (`px-0.5
gap-0.5` override) wrapping the overlapping icons and the `+N` overflow
  count as plain muted text — only the outer shell carries a border, per
  the user's direction to "make the link cluster follow the badge
  convention." Individual icons keep a solid `bg-overlay` backing circle
  (no border) so an overlapping icon's transparent SVG background doesn't
  let the icon underneath show through; icon backing circles are `size-3.5`
  overlapping by `-ml-1`, and each `ProviderIcon` renders at `size-2.5`
  (10px) instead of its previous default.
- `provider-icon.tsx` (`f6b427e`) — added an optional `className` prop so
  callers (here, `LinkCluster`) can override the icon's default size; wired
  into the branded-icon (`BRAND` map) render path.
- **Bug found while writing this doc, fixed in the same pass:** the
  className override was only wired into the branded-icon path — the
  `Globe` fallback (rendered for any `provider` not in the `BRAND` map,
  including the `"generic"` provider used throughout `link-cluster.test.tsx`
  fixtures) still hardcoded `ICON_CLASS` and ignored `className` entirely.
  An unrecognized-provider link would render its fallback icon at the old
  12px while every branded-provider icon around it had shrunk to 10px.
  Fixed by merging `className` into the `Globe` element via `cn(...)`, same
  as the branded path.
- `due-date.tsx` / `packages/domain/src/dates.ts` (`6d158be`) — dropped the
  amber "soon" tier (`daysUntil <= 2`) from `DueTone`/`describeDueDate`; a
  due date now reads as neutral, or red once `overdue`. `dates.test.ts`
  updated (previously-`"soon"` cases now expect `"normal"`).
- `priority-badge.tsx` (`6d158be`) — `PriorityIcon`'s glyph shrinks to
  `size-2.5` (10px) for every level except `Priority.Urgent`, which keeps
  `size-3` (12px) since it's the one level that must read at a glance. The
  `CHIP_ICON` badge shell stays a fixed 18px regardless.

No plan-checkbox or `docs/design/DESIGN.md` update was needed for the
due-date/priority pieces (presentation-only tone/size tweaks, no new
structure); the link-cluster badge-convention change doesn't have a
DESIGN.md mention of its own yet — folding it into DESIGN.md §7's
icon-cluster note is a reasonable future touch-up, not required for this
change to be correct.

## Why (decisions)

- **Reused the existing hand-placed-tier architecture** (`collectBadgeNodes`
  - key-sets + two always-hand-placed elements) rather than introducing a new
    layout mechanism — only the tier groupings and the `shortId`/`ProjectChip`
    positions changed. The per-board `badgeConfig` settings
    (`apps/web/components/board/badge-config.tsx`) continue to work unchanged:
    they still control whether priority/dueDate/labels/links/checklist show at
    all, just within the new fixed 3-line grouping instead of the old 2-tier
    one.
- **Sequenced after severity's removal (Units 3/4).** The old middle row was
  `project + severity + labels`; with severity gone, the row naturally
  collapses to `labels`-only, which is exactly what this unit's line 2 is.
  Landing this unit first would have left a `project + labels` tier one
  release with no defined resting shape.
- **DESIGN.md updates were made required, not optional**, per document-review
  (design-lens finding): the repo's own binding rule says to keep DESIGN.md
  current when a change invalidates it, and this unit invalidates several
  passages that named "severity" as part of the shipped UI.

## How it works

`CardFace` derives three node lists from `config` via `collectBadgeNodes`
with per-tier key filters (`LINE1_RIGHT_KEYS = {dueDate, checklist}`,
`LABEL_KEYS = {labels}`, `LINE3_KEYS = {priority, links}`), then lays out
four fixed lines (post-refinement order — see "Follow-up refinement" above):

```
line 1:          [shortId]  …ml-auto…  [line1RightNodes]
line 2:          [status glyph]  [title]
line 3 (if any): [labelNodes]
line 4 (if any): [line3Nodes]  …ml-auto…  [ProjectChip?]
```

Because status/priority/links/due/checklist/project are placed by hand,
`config` (the per-board `badgeConfig`) controls only _whether_ a field shows
(key present) — `labels` is the only field whose _position within its tier_
still follows `config`'s order (moot today since it's alone in its tier, but
kept for parity with the original design and in case a future field joins
that line).

## Design

- No new tokens — reuses `CHIP`/`CHIP_ICON` (`apps/web/components/card/chip.ts`)
  and the existing `mt-1.5 flex flex-wrap items-center gap-1.5` row rhythm for
  lines 1 and 4. The labels row (line 3) uses a tighter `gap-0.5` — label
  chips sit close enough together to read as one group, distinct from the
  more deliberate spacing between different fields on the other lines.
- No new transitions — this is a structural reflow of existing elements, not
  a new interactive affordance.
- Dark mode: verified live against the demo account (`demo@boardly.app`) —
  the "Everything ticket" seed card renders line 1 (`BRD-1`, `Tomorrow` due,
  `2/4` checklist, no archive affordance), line 2 (title), line 3 (7 label
  chips wrapping), and line 4 (priority icon, 7-link cluster with `+2`
  overflow, `Platform` project chip pushed to the far right) in the
  documented order; confirmed via `document.body.innerHTML`/DOM inspection
  that no `severity` reference remains anywhere on the card face or in the
  card-detail drawer's Properties/Activity sections, and via a direct DOM
  query that the project chip carries a non-zero `margin-left` from
  `ml-auto`.

## How to test / verify

- `apps/web/components/card/card.test.tsx` — `describe("card face layout (Unit 5)")`:
  - Happy path: a card with ticket id, due date, checklist, labels, priority,
    links, and project renders exactly 3 metadata rows (the title row is
    spliced out by `metaRows`) in DOM order, with line 1/3/4 content and
    ordering asserted via `within(row)` queries and
    child-index comparisons (not text-regex, since `PriorityBadge`/`LinkCluster`
    render icon-only with no visible text).
    (`metaRows` indices below refer to the spliced list, not the literal
    card-face line numbers — see the helper's own doc comment.)
  - Edge case: no labels → exactly 2 `metaRows` (labels row omitted).
  - Edge case: no due date/checklist → line 1 still renders with just the
    ticket id.
  - Edge case: no priority/links/project → exactly 2 `metaRows` (line 4
    omitted).
- `pnpm --filter @boardly/web exec vitest run` — 180 tests across 32 files,
  all green (`card.test.tsx` alone: 12, including the 4 layout tests, updated
  for the follow-up reorder); `tsc --noEmit` and `eslint` clean.
- Manual (dark mode): see Design section above.
- Third follow-up (link-cluster badge, due-date tone, priority glyph size,
  `ProviderIcon` fallback fix): no new automated assertions — these are
  presentational (colors/sizes/border placement) changes that the existing
  `link-cluster.test.tsx` (icon count/order/title/aria-label) and
  `dates.test.ts` (tone strings, updated for the dropped `"soon"` value)
  already exercise structurally. Full suite re-run green (180/180) after
  each commit in the sequence; `tsc --noEmit`/`eslint` clean.

## Follow-ups / known gaps

- None for this unit. The card-face line order is now explicitly documented
  as locked-in (code comment in `card.tsx` + DESIGN.md §8) per the user's
  request not to have future work reshuffle it.
