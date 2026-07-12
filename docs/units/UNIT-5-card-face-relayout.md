# UNIT 5: Relayout the card face into the three requested lines

- **Plan unit:** 5 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R4
- **Commit(s):** _this unit's commit_

## What changed

- `apps/web/components/card/card.tsx` — restructured `CardFace`'s post-title
  content from two tiers (middle: project + severity + labels; bottom:
  priority + links left, due + checklist + id right) into three fixed lines:
  - **Line 1** — `card.shortId` (hand-placed, left) … `ml-auto` [due chip,
    checklist meter] (right). Always renders (it carries the ticket id).
  - **Line 2** — labels only (`config`-filtered to `["labels"]`); omitted
    entirely when the card has no labels.
  - **Line 3** — priority badge, then the link cluster, then `ProjectChip`
    last (previously always-leading the old middle row); omitted entirely
    when there's no priority, no links, and no project.
  - Renamed the tier key-sets: `MIDDLE_KEYS`/`BOTTOM_LEFT_KEYS`/`BOTTOM_RIGHT_KEYS`
    → `LABEL_KEYS`/`LINE3_KEYS`/`LINE1_RIGHT_KEYS`.
- `apps/web/components/card/chip.ts` — dropped the stale "severity" mention
  from the shared-shell comment.
- `docs/design/DESIGN.md` — rewrote the card-face bullet (§8) to describe the
  three-line structure instead of the old single wrapped badge row; dropped
  the now-nonexistent "severity pill" mentions from §2 (color encodings, the
  whole `**Severity:**` paragraph), §1 (principle 5's field list), §7 (the
  shadcn-mapping table's "Labels / due / severity pickers" row), and §8 (the
  card-detail property list).
- `apps/web/components/card/card.test.tsx` — new `describe("card face layout (Unit 5)")`
  block: 4 tests covering the full 3-line structure + DOM order, and each
  omission case.
- `packages/domain/src/badges.ts` — no change needed: `DEFAULT_BADGE_CONFIG`'s
  existing order (`status, priority, dueDate, labels, links, checklist`)
  already keeps `priority` before `links` and `dueDate` before `checklist`,
  matching the new lines' stated order.

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
`LABEL_KEYS = {labels}`, `LINE3_KEYS = {priority, links}`), then lays out:

```
line 1: [shortId]  …ml-auto…  [line1RightNodes]
line 2 (if any):    [labelNodes]
line 3 (if any):    [line3Nodes]  [ProjectChip?]
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
  `2/4` checklist), line 2 (7 label chips wrapping), and line 3 (priority
  icon, 7-link cluster with `+2` overflow, `Platform` project chip) in the
  documented order; confirmed via the accessibility tree that no `severity`
  reference remains anywhere on the card face or in the card-detail drawer's
  Properties/Activity sections.

## How to test / verify

- `apps/web/components/card/card.test.tsx` — `describe("card face layout (Unit 5)")`:
  - Happy path: a card with ticket id, due date, checklist, labels, priority,
    links, and project renders exactly 3 metadata rows in DOM order, with
    line 1/2/3 content and ordering asserted via `within(row)` queries and
    child-index comparisons (not text-regex, since `PriorityBadge`/`LinkCluster`
    render icon-only with no visible text).
  - Edge case: no labels → exactly 2 rows (line 2 omitted).
  - Edge case: no due date/checklist → line 1 still renders with just the
    ticket id.
  - Edge case: no priority/links/project → exactly 2 rows (line 3 omitted).
- `pnpm --filter @boardly/web exec vitest run` — 181 tests across 32 files,
  all green (`card.test.tsx` alone: 13, including the 4 new layout tests);
  `tsc --noEmit` and `eslint` clean.
- Manual (dark mode): see Design section above.

## Follow-ups / known gaps

- None for this unit. Unit 6 (data cleanup) and the final quality-check pass
  remain.
