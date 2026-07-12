# UNIT 5: Relayout the card face into the requested lines

- **Plan unit:** 5 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R4
- **Commit(s):** _this unit's commit_ + a follow-up refinement commit (see
  "Follow-up refinement" below)

## What changed

- `apps/web/components/card/card.tsx` — restructured `CardFace`'s post-title
  content from two tiers (middle: project + severity + labels; bottom:
  priority + links left, due + checklist + id right) into four fixed lines:
  - **Line 1** — `card.shortId` (hand-placed, left) … `ml-auto` [due chip,
    checklist meter, then the hover-only archive button] (right). Always
    renders (it carries the ticket id and the archive affordance).
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
   *far* right (`ml-auto`) instead of just trailing the priority/link nodes.

This changed the DOM order from `[title row, line1, labels?, line3?]` to
`[line1, title row, labels?, line3?]`. `card.test.tsx`'s `metaRows` helper was
updated to splice out the title row at its new index (1) instead of index 0.
Applied directly (small, well-understood UI reorder) rather than re-running
`/ce:plan` — the code comment at the top of `card.tsx` and the DESIGN.md §8
bullet both now state the four lines explicitly so this ordering doesn't
drift in future work.

## Why (decisions)

- **Reused the existing hand-placed-tier architecture** (`collectBadgeNodes`
  + key-sets + two always-hand-placed elements) rather than introducing a new
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
line 1:          [shortId]  …ml-auto…  [line1RightNodes]  [archive (hover)]
line 2:          [status glyph]  [title]
line 3 (if any): [labelNodes]
line 4 (if any): [line3Nodes]  …ml-auto…  [ProjectChip?]
```

Because status/priority/links/due/checklist/project are placed by hand,
`config` (the per-board `badgeConfig`) controls only *whether* a field shows
(key present) — `labels` is the only field whose *position within its tier*
still follows `config`'s order (moot today since it's alone in its tier, but
kept for parity with the original design and in case a future field joins
that line).

## Design

- No new tokens — reuses `CHIP`/`CHIP_ICON` (`apps/web/components/card/chip.ts`)
  and the existing `mt-1.5 flex flex-wrap items-center gap-1.5` row rhythm.
- No new transitions — this is a structural reflow of existing elements, not
  a new interactive affordance.
- Dark mode: verified live against the demo account (`demo@boardly.app`) —
  the "Everything ticket" seed card renders line 1 (`BRD-1`, `Tomorrow` due,
  `2/4` checklist), line 2 (title), line 3 (7 label chips wrapping), and
  line 4 (priority icon, 7-link cluster with `+2` overflow, `Platform`
  project chip pushed to the far right) in the documented order; confirmed
  via `document.body.innerHTML`/DOM inspection that no `severity` reference
  remains anywhere on the card face or in the card-detail drawer's
  Properties/Activity sections, and via a direct DOM query (post-refinement)
  that the archive button lives inside line 1 and the project chip carries a
  non-zero `margin-left` from `ml-auto`.

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
- `pnpm --filter @boardly/web exec vitest run` — 181 tests across 32 files,
  all green (`card.test.tsx` alone: 13, including the 4 layout tests, updated
  for the follow-up reorder); `tsc --noEmit` and `eslint` clean.
- Manual (dark mode): see Design section above.

## Follow-ups / known gaps

- None for this unit. The card-face line order is now explicitly documented
  as locked-in (code comment in `card.tsx` + DESIGN.md §8) per the user's
  request not to have future work reshuffle it.
