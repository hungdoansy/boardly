---
title: Card face polish, cmd+K contrast fix, and severity removal
type: fix
status: complete
date: 2026-07-12
---

# Card face polish, cmd+K contrast fix, and severity removal

## Overview

Four independent polish/cleanup items surfaced from using the app:

1. A Unicode arrow (`→`) still leaks into rendered UI in one spot, and a Unicode
   checkmark (`✓`) is used as a UI icon in another — both violate the binding
   SVG-only icon rule.
2. The cmd+K command palette's highlighted/selected row is visually
   indistinguishable from its background — keyboard navigation is effectively
   invisible.
3. The `severity` field is removed completely — UI, command layer, sync
   schema, domain types. No replacement.
4. The kanban card face's post-title layout is restructured into three fixed
   lines: `{ticket id} … {deadline} {checklist}`, then `{labels}`, then
   `{urgency} {link icons} {project badge}`.

A fifth item in the original request — restyling the UI to take inspiration
from a linked Figma file — is **dropped**: the linked Figma Make file
("Boardly - Client Demo") turned out to be an unrelated corporate
Board-of-Directors governance app (meetings, resolutions, e-signatures, audit
log) for a fictitious "Meridian Capital", not a kanban redesign — a
coincidental name collision on "board". The user confirmed this was the wrong
link and to skip it; see Scope Boundaries.

## Problem Frame

Items 1–2 are small, isolated bugs. Item 3 (severity) is a full-stack field
removal: severity was introduced in `docs/units/UNIT-2.3-priority-severity.md`
and now touches domain enums/types, filter/group/activity logic, Yjs sync
schema, the command catalog (and by extension the generated REST/MCP
surfaces), several web components, and the demo seed script. Item 4 depends on
item 3 landing first, because the current card face's "middle row" is
`project + severity + labels` — once severity is gone, the middle row
naturally collapses toward the new spec's `labels`-only line, and the
remaining fields (priority, links, project, due date, checklist, ticket id)
need to be rearranged into the requested three lines.

## Requirements Trace

- R1. No Unicode glyph renders as UI (icon or leaked data marker) anywhere in
  the app — `docs/design/DESIGN.md` §7.1 is binding.
- R2. The cmd+K palette's currently-highlighted row is visibly distinct from
  the dialog background in both dark and light mode.
- R3. `severity` no longer exists anywhere: no UI control, no command, no
  sync-schema field, no domain type/enum, no seed-script reference, and no
  leftover data — the user explicitly wants existing persisted `severity`
  values actively purged, not left inert ("remove them completely... like it
  never existed").
- R4. The kanban card face (not the list view) renders, below the title row:
  line 1 = ticket id (left) … deadline + checklist (right); line 2 = labels;
  line 3 = urgency (priority) + link icon cluster + project badge.

## Scope Boundaries

- The Figma-inspired restyle is dropped from this plan (see Overview) — not a
  non-goal so much as a withdrawn request; no further action.
- The list view (`apps/web/components/board/list-view.tsx`) row layout is
  unchanged — it already renders a single dense `BadgeRow`, structurally
  separate from the card face (same precedent as
  `docs/units/UNIT-P3-card-face-layout.md`).
- No Drizzle/Postgres migration for severity — it was never a relational
  column (`apps/server/src/db/schema.ts` has no `severity` column; card fields
  live inside the Yjs CRDT doc, not as SQL columns).
- No Drizzle involvement in the data cleanup either — the one-off cleanup
  (Unit 6) operates on the Yjs doc directly, not on any SQL table.

## Context & Research

### Relevant code and patterns

- **Glyph rule, verbatim:** `docs/design/DESIGN.md:233-253` (§7.1) explicitly
  covers this exact case: *"If a data string carries a glyph marker (e.g. a
  provider short-label ending in ` →` to flag a deep link), strip it at the
  render boundary and draw the SVG — don't print the glyph."*
- **Where the arrow leaks:** `packages/domain/src/links/registry.ts` /
  `packages/domain/src/links/providers/{slack,claude}.ts` `shortLabel()`
  functions return raw strings ending in `" →"` (e.g. `"msg →"`,
  `"session →"`). `apps/web/components/card/links.tsx:28-33` (the card-drawer
  list) already strips the marker and renders lucide's `ArrowUpRight` instead
  — this is the pattern to follow. `apps/web/components/card/link-cluster.tsx:30`
  (the **card-face** icon cluster) does **not** strip it — it puts the raw
  label straight into the HTML `title` attribute, so hovering a deep-link icon
  on the card face shows the literal glyph in the native tooltip.
- **Where the checkmark leaks:** `apps/web/components/board/filter-builder.tsx:466-469`
  renders a bare `✓` text node (in an `aria-hidden` span, but still visible to
  sighted users) for the selected option in a filter-value multi-select list.
  `apps/web/components/card/severity-select.tsx` (a file this plan deletes)
  already shows the correct pattern one file over: lucide's `Check` icon.
- **cmd+K highlight:** `packages/ui/src/components/command.tsx`'s
  `CommandItem` applies `data-[selected=true]:bg-overlay`. `packages/ui/src/components/dialog.tsx:39`'s
  `DialogContent` (which `CommandDialog` wraps the whole palette in) uses
  `bg-popover`, which resolves to the **same** `--bg-overlay` token
  (`packages/ui/src/theme.css:117` → `--bg-overlay`, `#1c1d21` dark /
  `#ffffff` light). The highlighted row and its container are therefore the
  identical color — zero contrast. `docs/design/DESIGN.md:44-48` documents a
  binding rule for exactly this situation ("use `bg-hover`, never
  `bg-overlay`, for interactive states on an already-`bg-overlay` surface")
  and a purpose-built token, `--bg-selected` (`rgba(94,106,210,0.14)` dark /
  `0.1` light — "Selected row/card tint (accent-derived)",
  `packages/ui/src/theme.css:27,83`). `DESIGN.md:279` already documents this
  exact pairing — `--bg-selected` + a 2px accent left border — for the
  card-face "selected" state, so the same treatment for cmd+K is consistency,
  not a new pattern.
- **Severity's full surface** (grep-verified, see per-unit file lists below):
  `packages/domain/src/{enums.ts, types.ts, badges.ts, filters.ts, activity.ts,
  io/snapshot.ts, io/obsidian.ts}`; `packages/sync/src/{schema.ts,
  board-doc.ts}`; `packages/commands/src/{catalog.ts, commands/card.ts,
  commands/view.ts}`; `apps/web/components/card/{card.tsx, badge-row.tsx,
  card-detail.tsx, severity-badge.tsx, severity-select.tsx}`;
  `apps/web/components/board/{filter-builder.tsx, views.tsx}`;
  `apps/web/lib/use-board.ts`; `packages/sync/scripts/seed-demo-board.ts`.
  `apps/server/src/routes/commands.ts` and `apps/mcp/src/tools.ts` both
  generate their surfaces from `packages/commands/src/catalog.ts` generically
  (no per-command server code), so removing `setCardSeverity` from the catalog
  removes it from REST and MCP simultaneously — no separate server-layer edit.
- **Card face today:** `apps/web/components/card/card.tsx` renders three tiers
  below the title row via `collectBadgeNodes` (`apps/web/components/card/badge-row.tsx`)
  filtered by hand-maintained key-sets — `MIDDLE_KEYS = {severity, labels}`,
  `BOTTOM_LEFT_KEYS = {priority, links}`, `BOTTOM_RIGHT_KEYS = {dueDate,
  checklist}` — plus two hand-placed elements outside that system: the
  `ProjectChip` (always leads the middle row when a project is set) and
  `card.shortId` (always trails the bottom-right cluster via `ml-auto`).
  `docs/units/UNIT-P3-card-face-layout.md` is the origin doc for this
  structure and the shared `CHIP`/`CHIP_ICON` shell
  (`apps/web/components/card/chip.ts`) every badge wears.
  `packages/domain/src/badges.ts` (`BADGE_FIELDS`/`DEFAULT_BADGE_CONFIG`) is
  the per-board configurable ordering for the subset of fields that are
  toggleable (status/priority/severity/dueDate/labels/links/checklist);
  `apps/web/components/board/badge-config.tsx` is the settings picker over
  that list and needs no direct edit — it derives its options purely from
  `BADGE_FIELDS`, so severity disappears from it automatically once removed
  from the domain list (Unit 3).
- **Domain naming for "urgency":** there is no separate `urgency` field.
  `packages/domain/src/enums.ts` has `Priority` (`None`…`Urgent`, 0–4) and
  `Severity` (`S1`…`S4`, being removed) — the only two graded fields. The
  request's "urgency" resolves to `priority` (§ Key Technical Decisions).
- **Filter/group safety net:** `packages/domain/src/filters.ts`'s
  `matchesClause` already has `default: return true` for an unrecognized
  `clause.field` (line 131-132) — a stale persisted filter clause referencing
  `"severity"` degrades to a harmless no-op automatically, no change needed.
  `groupKeys`/`rankFor`/`groupLabel` (lines 202-294), by contrast, have **no**
  default arm — a legacy persisted `groupBy: "severity"` value would make
  `groupKeys` return `undefined`, and `for (const key of undefined)` in
  `groupCards` throws at runtime. This needs an explicit fallback (Unit 3).

### Institutional learnings

`docs/solutions/` does not exist in this repo; `docs/units/` is the
equivalent record. Directly relevant prior units: `UNIT-2.3-priority-severity.md`
(severity's original introduction — the removal's checklist mirrors this
doc's "what changed" section in reverse), `UNIT-P3-card-face-layout.md` (the
current 3-tier card face this plan restructures), `UNIT-6.4-card-face-link-cluster.md`
(the link-cluster component being fixed in Unit 1).

## Key Technical Decisions

- **"Urgency" = `priority`.** No dedicated urgency field exists; severity (the
  only other graded field) is being removed in this same plan, leaving
  priority as the only candidate. Reuse `PriorityBadge`/`card.priority`
  as-is — no new field.
- **Actively purge persisted `severity` data — do not just stop reading it.**
  Existing per-user Yjs docs may retain a `severity` key on old card maps, a
  `"severity"` string inside a persisted `badgeConfig`/filter clause/`groupBy`
  choice, or `type: "severity"` activity-log entries. The plan's first draft
  treated this as safe-to-leave-inert (the project's prior precedent for
  structural collapses, `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md`'s
  "Reset rollout" note); the user explicitly overrode that during review —
  they want it removed from the data too, "like it never existed" — so Unit 6
  is a one-off script that connects to the real account's board doc and
  strips every trace. The `groupKeys`/`groupLabel` fallback (below) stays in
  the plan regardless, as belt-and-suspenders for the window before Unit 6
  runs and for any doc it doesn't reach — everywhere else, the existing "skip
  unknown key" (`collectBadgeNodes`, `BadgeConfig`) or "default: true"
  (`matchesClause`) behavior degrades safely on its own even without cleanup.
- **Add a `groupBy` fallback for unrecognized values, in both `groupKeys` and
  `groupLabel`.** Treat any string that doesn't match a known `GroupByField`
  as ungrouped (a single `""` lane, from `groupKeys`) instead of letting
  `groupKeys` return `undefined` and crash the `for...of` in `groupCards`.
  `groupLabel` needs the same treatment independently — it's called directly
  with the raw persisted `groupBy` value by `swimlanes.tsx`/`list-view.tsx` to
  render the lane header, not only through `groupCards` — so without its own
  fallback a legacy `groupBy: "severity"` would still land cards in the
  correct ungrouped lane but render that lane's title as `undefined`. Small,
  cheap, and closes the crash risk *and* the silent-`undefined`-label risk
  severity's removal introduces for existing saved views.
- **cmd+K fix: swap `bg-overlay` → `bg-selected` on `CommandItem`'s
  `data-[selected=true]` state**, matching the token DESIGN.md already
  reserves for "selected row/card tint" and the exact pairing (tint + 2px
  accent left border) DESIGN.md already documents for card-face selection —
  applying the same combination keeps the palette consistent with that
  existing rule rather than inventing a new treatment.
- **Glyph fix: extract one shared "strip the deep-link marker" helper** (next
  to `shortLabelFor` in `packages/domain/src/links/registry.ts`) instead of
  duplicating the `.endsWith(" →")` check that today lives only in
  `links.tsx`. Both `links.tsx` (drawer list) and `link-cluster.tsx` (card
  face) call the shared helper, so the two surfaces can't drift out of sync
  again.
- **Card-face relayout reuses the existing hand-placed-tier architecture**
  (`collectBadgeNodes` + key-sets + two hand-placed elements) rather than
  introducing a new layout mechanism — only the tier groupings and the
  `shortId`/`ProjectChip` hand-placed positions change. The per-board
  `badgeConfig` toggle/reorder settings (`badge-config.tsx`) continue to work
  unchanged: it still controls whether priority/dueDate/labels/links/checklist
  show, just within the new fixed 3-line grouping instead of the old
  2-tier one.

## Open Questions

### Resolved during planning

- Figma-inspired restyle: dropped (user confirmed the link was wrong).
- "Urgency" in the requested layout: resolved to `priority` (no other
  candidate field exists once severity is removed).
- Whether to migrate/strip existing `severity` data from Yjs docs: **yes** —
  reversed mid-review from the initial "leave it inert" draft after the user
  said they want it removed from the data completely, not just unread; see
  Unit 6.

### Deferred to implementation

- Exact new names for the card-face tier key-set constants (today
  `MIDDLE_KEYS`/`BOTTOM_LEFT_KEYS`/`BOTTOM_RIGHT_KEYS`) — cosmetic, left to
  whoever implements Unit 5.
- Whether `priority-severity.test.tsx` becomes a renamed priority-only file or
  is folded into `card.test.tsx` — either is fine as long as no severity
  assertions remain anywhere in the suite.

## Implementation Units

- [x] **Unit 1: Strip the remaining Unicode glyphs — SVG at the render boundary**

**Goal:** Fix the two remaining places a Unicode glyph reaches the rendered
UI: the card-face link-cluster tooltip and the filter-builder selected-option
checkmark.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `packages/domain/src/links/registry.ts` (add the shared
  strip-deep-link-marker helper next to `shortLabelFor`)
- Modify: `apps/web/components/card/links.tsx` (use the shared helper instead
  of its inline `.endsWith(" →")` check)
- Modify: `apps/web/components/card/link-cluster.tsx` (use the shared helper
  so the `title` attribute never carries the raw `" →"` marker)
- Modify: `apps/web/components/board/filter-builder.tsx` (replace the bare
  `✓` text node with lucide's `Check` icon, sized `size-3.5` to match sibling
  icon usage in the same file)
- Modify: `apps/web/components/card/link-cluster.test.tsx` (update the
  `title` assertions to expect the stripped label)
- Modify: `apps/web/components/board/filter-builder.test.tsx` (assert the
  selected option renders an SVG `Check`, not the text `"✓"`)

**Approach:**
- Add a small pure helper (e.g. `stripDeepLinkMarker(label: string): { label:
  string; isDeepLink: boolean }`) in `registry.ts` alongside `shortLabelFor`,
  and have both `links.tsx` and `link-cluster.tsx` call it instead of each
  re-deriving deep-link-ness.
- `link-cluster.tsx`'s `title={...}` attribute is plain text (no SVG
  possible in a native tooltip) — assign the stripped label there; the
  `ArrowUpRight` deep-link affordance already exists in the full drawer list,
  so nothing is lost, only the leaked glyph.

**Test scenarios:**
- Happy path: a deep-link provider label (e.g. Slack `"msg →"`) renders a
  card-face icon whose `title` attribute is the clean label with no trailing
  glyph.
- Happy path: the filter-builder's selected multi-select option renders a
  lucide `Check` SVG (queryable via role/test-id), not the string `"✓"`.
- Edge case: a non-deep-link provider label (no trailing marker) is
  unaffected — `title` unchanged, `isDeepLink` false.
- Regression: `links.tsx`'s existing `ArrowUpRight` rendering for deep links
  in the drawer list is unchanged (still uses the shared helper's output).

**Verification:**
- `link-cluster.test.tsx` and `filter-builder.test.tsx` pass with the updated
  assertions; a repo-wide grep for the banned glyph set (arrows, `✓✔✕✗×✖`,
  bullets, chevrons) across `apps/web`/`packages` source (excluding comments
  and the `<kbd>`/prose exceptions DESIGN.md §7.1 allows) returns no rendered-UI
  hits.

- [x] **Unit 2: Fix cmd+K palette selected-row contrast**

**Goal:** Make the currently-highlighted command-palette row visibly distinct
from the dialog background in both themes.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `packages/ui/src/components/command.tsx` (`CommandItem`'s
  `data-[selected=true]` classes)
- Modify: `apps/web/components/command-palette/palette.test.tsx` (extend or
  add an assertion on the selected item's class list)

**Approach:**
- Replace `data-[selected=true]:bg-overlay` with `data-[selected=true]:bg-selected`,
  matching the token DESIGN.md reserves for "selected row/card tint."
- Give `CommandItem`'s base (unselected) className a `border-l-2
  border-l-transparent` reservation **first**, then add `data-[selected=true]:border-l-[var(--accent)]`
  on top — mirroring the exact tint + accent-left-border pairing DESIGN.md
  already documents for card-face selection (`DESIGN.md:279`), so cmd+K's
  selected state matches the app's one existing "selected" convention rather
  than inventing a second one. Reserving the border width on the unselected
  state (not just adding it on select) means only the border's *color* changes
  when a row becomes/stops being selected — no content shift, per this repo's
  "no unnecessary layout shift" rule.

**Test scenarios:**
- Happy path: the `CommandItem` under keyboard/mouse selection carries
  `bg-selected` (not `bg-overlay`) in its resolved class list.
- Edge case: a `data-disabled=true` item is unaffected by the selected-state
  change — still shows the existing `pointer-events-none opacity-50`
  treatment regardless of selection.
- Edge case: selecting/deselecting a row does not shift its label/icon content
  horizontally — the unselected state already reserves the 2px left-border
  space (transparent), so only the border color changes on selection.
- Test expectation: primarily a visual/token change — the class-list
  assertion above is the automated coverage; a dark-mode (and light-mode)
  screenshot of the palette with an item highlighted is the primary
  verification per this repo's Definition of Done.

**Verification:**
- `palette.test.tsx` passes; manual dark-mode screenshot shows a clearly
  visible highlighted row while navigating with arrow keys.

- [x] **Unit 3: Remove `severity` — domain, sync, commands (and generated REST/MCP)**

**Goal:** Remove every trace of `severity` from the domain model, Yjs sync
schema, and command layer, with a safety net so any already-persisted
`severity` reference degrades gracefully instead of crashing.

**Requirements:** R3

**Dependencies:** None (this unit and Unit 1/2 can land in any order; Unit 4
and Unit 5 depend on this one)

**Files:**
- Modify: `packages/domain/src/enums.ts` (remove `Severity`, `SeverityValue`,
  `SeverityName`, `SEVERITY_NAMES`, `SEVERITY_META`)
- Modify: `packages/domain/src/types.ts` (remove `Card.severity`)
- Modify: `packages/domain/src/badges.ts` (remove the `severity` entry from
  `BADGE_FIELDS` and `DEFAULT_BADGE_CONFIG`)
- Modify: `packages/domain/src/filters.ts` (remove `"severity"` from
  `FilterField`, the `matchesClause` `"severity"` case, `GroupByField`, and
  the `groupKeys`/`rankFor`/`groupLabel` `"severity"` cases; add an
  unrecognized-`groupBy`-value fallback in **both** `groupKeys` — return a
  single `[""]` key so `groupCards`'s `for...of` never iterates `undefined`
  — **and** `groupLabel` — return a generic `"Ungrouped"` label instead of
  falling through to `undefined`, since `apps/web/components/board/swimlanes.tsx:58`
  and `apps/web/components/board/list-view.tsx:183` call `groupLabel` directly
  with the same raw persisted `groupBy` value, independent of `groupCards`)
- Modify: `packages/domain/src/activity.ts` (remove `SeverityChangeActivity`
  and its entry in the activity union)
- Modify: `packages/domain/src/io/snapshot.ts` (remove the `severity` zod
  field)
- Modify: `packages/domain/src/io/obsidian.ts` (remove the `severity: null`
  write)
- Modify: `packages/sync/src/schema.ts` (remove the `severity` Y.Map read)
- Modify: `packages/sync/src/board-doc.ts` (remove `setCardSeverity`, the
  `severity` initial-set on card creation, the activity append/replay
  `"severity"` case, and the `severity` snapshot-serialize line)
- Modify: `packages/commands/src/catalog.ts` (remove `setCardSeverity` from
  the registered command list)
- Modify: `packages/commands/src/commands/card.ts` (remove the
  `setCardSeverity` command definition)
- Modify: `packages/commands/src/commands/view.ts` (remove `"severity"` from
  the `field`/`groupBy` zod enums)
- Test: `packages/domain/src/filters.test.ts`
- Test: `packages/domain/src/io/io.test.ts`
- Test: `packages/sync/src/activity.test.ts`
- Test: `packages/sync/src/io.test.ts`

**Approach:**
- Mechanical, type-checker-guided removal: deleting `Severity`/`SeverityValue`
  from `enums.ts` and `severity` from `types.ts`'s `Card` interface makes
  every remaining reference a compile error, so TypeScript strict mode plus
  the existing test suites are the safety net (the same approach the prior
  board-collapse plan used for its large mechanical `boardId` removal).
- `apps/server/src/routes/commands.ts` and `apps/mcp/src/tools.ts` need no
  direct edit — both generate their surfaces from the catalog generically, so
  `setCardSeverity` disappears from REST and MCP once removed from
  `catalog.ts`/`commands/card.ts`.
- No Drizzle migration: confirmed no `severity` column exists in
  `apps/server/src/db/schema.ts`.

**Test scenarios:**
- Happy path: `filters.test.ts` — filtering/sorting/grouping by `priority`,
  `status`, `label`, `dueDate`, `assignee` all still pass unchanged after
  `severity` is removed from the union types.
- Integration/error path: `groupCards(cards, "severity")` (simulating a
  legacy persisted saved view — cast or a raw string in the test) does not
  throw; it resolves to a single ungrouped (`""`) lane rather than iterating
  `undefined`.
- Integration/error path: `groupLabel("severity", "")` (simulating the same
  legacy value, called the way `swimlanes.tsx`/`list-view.tsx` call it
  directly) returns a generic `"Ungrouped"` string, not `undefined`.
- Edge case: `matchesClause` given a stale `{ field: "severity", condition:
  "is", values: [1] }` clause (again simulating legacy persisted data) returns
  `true` for every card (the existing `default: return true` arm) — assert
  this explicitly so it's documented behavior, not an accident.
- Regression: `activity.test.ts` and both `io.test.ts` suites no longer
  reference severity; existing priority/status/label/due-date/checklist
  coverage in those files stays green.
- Integration: a fresh `Card` produced by `packages/sync/src/schema.ts`'s
  Y.Map → domain converter has no `severity` property at all (not even
  `null`).

**Verification:**
- `pnpm --filter @boardly/domain exec vitest run`, `pnpm --filter @boardly/sync exec vitest run`,
  and `pnpm --filter @boardly/commands exec vitest run` (or the repo's
  equivalent aggregate test command) all green; `tsc --noEmit` clean across
  `packages/domain`, `packages/sync`, `packages/commands`; grep for
  `[Ss]everity` across `apps/server/src` and `apps/mcp/src` returns nothing.

- [x] **Unit 4: Remove `severity` — web UI and seed script**

**Goal:** Remove every severity-related UI control, action, and seed-data
reference, completing R3 end-to-end.

**Requirements:** R3

**Dependencies:** Unit 3

**Files:**
- Delete: `apps/web/components/card/severity-badge.tsx`
- Delete: `apps/web/components/card/severity-select.tsx`
- Modify: `apps/web/components/card/badge-row.tsx` (remove the `SeverityBadge`
  import and the `severity` branch in `collectBadgeNodes`)
- Modify: `apps/web/components/card/card-detail.tsx` (remove the Severity row
  + `SeveritySelect` import/usage)
- Modify: `apps/web/components/card/activity.tsx` (remove the `SEVERITY_META`
  import and the `case "severity":` branch in its activity-log description
  renderer, plus the `Signal` icon import if it has no other use in the file)
- Modify: `apps/web/components/board/filter-builder.tsx` (remove the
  `Severity` import, `"severity"` from `ValueKind`, `FILTER_OPS_BY_KIND.severity`,
  `FIELD_LABELS.severity`, `SEVERITY_OPTS`, and the `"severity"` cases in the
  value-kind/default-clause switches — coordinate with Unit 1's edits to the
  same file)
- Modify: `apps/web/components/board/views.tsx` (remove the `{ value:
  "severity", label: "Severity" }` entry from `GROUP_OPTIONS`)
- Modify: `apps/web/lib/use-board.ts` (remove the `setSeverity` action and
  `setCardSeverity` import)
- Modify: `packages/sync/scripts/seed-demo-board.ts` (remove the `Severity`/
  `SeverityValue` import, the `severity` spec field, all per-card `severity:`
  assignments, the "severity" mentions in the kitchen-sink card's description
  text, and `"severity"` from the badge-config array it seeds)
- Test: `apps/web/components/card/priority-severity.test.tsx` (split into a
  priority-only file, or fold into `card.test.tsx` — no severity assertions
  remain either way)
- Test: `apps/web/components/card/card.test.tsx`
- Test: `apps/web/components/card/activity.test.tsx`
- Test: `apps/web/components/card/badge-row.test.tsx`
- Test: `apps/web/components/board/filter-builder.test.tsx`
- Test: `apps/web/components/board/list-view.test.tsx`
- Test: `apps/web/components/board/swimlanes.test.tsx`

**Approach:**
- Same mechanical, type-checker-guided removal as Unit 3, one layer up.
- `apps/web/components/board/badge-config.tsx` (the settings picker) needs no
  direct edit — it derives its toggle list purely from `BADGE_FIELDS`, which
  Unit 3 already trimmed.

**Test scenarios:**
- Happy path: the filter builder's field picker no longer offers "Severity";
  existing priority/status/label filter UI is unaffected.
- Happy path: the view options' group-by picker no longer offers "Severity".
- Regression: `card.test.tsx`/`badge-row.test.tsx` drop all `setCardSeverity`
  imports and severity-badge assertions; remaining priority/dueDate/labels/
  checklist/links assertions stay green.
- Integration: opening the card-detail drawer for any card (including one
  whose underlying Yjs doc still has a leftover `severity` value from before
  this change) renders no "Severity" row and does not error.
- Regression: the card's activity log (`activity.test.tsx`) renders every
  remaining activity type (status, priority, due date, labels, links,
  checklist) correctly with no reference to a "severity" entry type.
- Regression: `list-view.test.tsx`/`swimlanes.test.tsx` (which exercise
  `groupCards`/`groupLabel` through the UI) stay green with severity removed
  from `GroupByField`.

**Verification:**
- `pnpm --filter @boardly/web exec vitest run` green; `tsc --noEmit` and
  `eslint` clean; grep for `[Ss]everity` across `apps/web` and
  `packages/sync/scripts` returns nothing; re-run the demo seed with
  `SEED_RESET=1` (per `[[boardly-seed-demo-account]]`) so the demo account's
  kitchen-sink card and badge config no longer reference severity.

- [x] **Unit 5: Relayout the card face into the three requested lines**

**Goal:** Restructure `CardFace`'s post-title rows into: line 1 = ticket id
(left) … deadline + checklist (right); line 2 = labels; line 3 = urgency
(priority) + link cluster + project badge.

**Requirements:** R4

**Dependencies:** Unit 3, Unit 4 (severity must be gone first — otherwise the
old middle row's `{severity, labels}` grouping has no natural home in the new
labels-only line)

**Files:**
- Modify: `apps/web/components/card/card.tsx` (the three tier key-sets and
  the JSX for the three rows; `shortId` and `ProjectChip` hand-placed
  positions move)
- Modify: `apps/web/components/card/badge-row.tsx` (only if the tier-filter
  contract needs adjusting — `collectBadgeNodes` itself likely needs no
  change, just new key-sets passed in from `card.tsx`)
- Modify: `packages/domain/src/badges.ts` (`DEFAULT_BADGE_CONFIG`'s intra-tier
  ordering, if the new tier groupings warrant reordering the remaining
  entries — e.g. keeping `priority` before `links` to match line 3's stated
  order)
- Modify: `docs/design/DESIGN.md` (§8 "Key screens", the card-face bullet
  around line 279 — drop "severity pill" and rewrite the row description to
  match the new three-line structure instead of the old two-tier one)
- Test: `apps/web/components/card/card.test.tsx`

**Approach:**
- Reuse the existing hand-placed-tier architecture (`collectBadgeNodes` +
  key-sets), reshaped into three tiers instead of two:
  - **Row 1:** `card.shortId` (hand-placed, left) … `ml-auto` [dueDate node,
    checklist node] (right) — same `ml-auto` split already used for today's
    bottom row, with `shortId` moved out of the right cluster to lead the row.
  - **Row 2:** labels only (config-filtered to `["labels"]`); omitted
    entirely when there are no labels, mirroring today's "omit an empty tier"
    rule for the middle row.
  - **Row 3:** priority node, then the link cluster, then `ProjectChip` last
    (previously always-leading the old middle row); omitted entirely when
    empty (no priority, no links, no project).
- The per-board `badgeConfig` settings continue to control whether
  priority/dueDate/labels/links/checklist show at all — only their grouping
  into rows and the `shortId`/`ProjectChip` hand-placed spots change.
- List view is explicitly untouched (Scope Boundaries).

**Test scenarios:**
- Happy path: a card with a ticket id, due date, checklist, labels, priority,
  links, and project renders exactly three post-title rows, in DOM order: row
  1 contains the ticket id and (right-aligned) the due chip and checklist
  chip; row 2 contains the label chips; row 3 contains the priority badge,
  link cluster, and project chip, in that order.
- Edge case: a card with no labels renders no row 2 element at all (same
  empty-tier omission as today's middle row).
- Edge case: a card with no due date and no checklist still shows row 1 with
  just the ticket id (no stray trailing whitespace/gap from the empty
  `ml-auto` cluster).
- Edge case: a card with no priority, no links, and no project renders no row
  3 at all.
- Regression: the existing Zen-focus assertion ("status leads title; no
  middle/bottom badges besides the id") still passes with the ticket id in
  its new row-1 position.

**Verification:**
- `card.test.tsx` passes; `tsc --noEmit`/`eslint` clean; manual dark-mode
  screenshot of the demo board (after Unit 4's reseed) confirms the three
  lines read in the requested order and match `DESIGN.md`'s density/spacing
  conventions for the card face.

- [x] **Unit 6: Actively purge persisted `severity` data from the real account**

**Goal:** Strip every leftover trace of `severity` from the user's live board
doc — card fields, badge config, saved-view filters/groupBy, and activity-log
entries — so nothing merely goes unread; it's gone. This is a scope addition
made during document review: the plan originally treated old data as safe to
leave inert, and the user explicitly overrode that.

**Requirements:** R3

**Dependencies:** Unit 3, Unit 4 (the cleanup script targets the post-removal
data shape and doesn't need any of the removed typed accessors)

**Files:**
- Create: `packages/sync/scripts/cleanup-severity.ts` (one-off, not part of
  the app or CI)

**Approach:**
- Model the script on `packages/sync/scripts/seed-demo-board.ts`'s existing
  auth → connect → mutate → flush pattern (HTTP login for a JWT + userId,
  Hocuspocus WebSocket connect to `board:{userId}` via a one-time ticket,
  mutate, wait for flush) — but point it at the real personal account via the
  same `SEED_EMAIL`/`SEED_PASSWORD` env-override mechanism the seed script
  already supports, not the demo default, and make it a one-off maintenance
  script (not idempotent-safe-to-rerun-in-CI like the seed script).
- Use raw Yjs primitives (`Y.Map.delete`, direct array/JSON rewrites), not the
  typed `@boardly/sync` accessors — by the time this runs (after Units 3/4),
  the typed severity accessors no longer exist.
- For every card `Y.Map`: delete the `severity` key if present.
- For the board meta's `badgeConfig` array: filter out the `"severity"`
  string.
- For every saved view: recursively filter out any filter clause with
  `field: "severity"` (including inside nested filter groups), and clear
  `groupBy` to `null` if it's `"severity"`.
- For the activity log: remove entries with `type: "severity"` — the user's
  "like it never existed" intent extends to historical log entries, not just
  currently-active fields.
- Idempotent by construction (each step is a no-op on data that's already
  clean), so it's safe to run more than once.

**Test scenarios:**
- Happy path: running the script against a doc with cards carrying `severity`
  values, a `badgeConfig` including `"severity"`, a saved view filtering by
  severity, and a saved view grouped by severity — after running, none of
  those traces remain (verified by re-reading the doc).
- Edge case: running the script a second time against an already-cleaned doc
  is a no-op (no errors, no changes).
- Edge case: a saved view whose filter is a nested group (`{op: "and",
  clauses: [{op: "or", clauses: [...]}]}` containing a `severity` clause deep
  inside) has that clause removed at whatever depth it's nested.
- Test expectation: this is an operational one-off script, not app code
  covered by the automated suites — its "test" is running it once against the
  real account and confirming the result, plus a scripted dry-run against a
  disposable local doc if one is easy to spin up for manual verification.

**Verification:**
- Run once against the real account after Units 3–5 land; confirm by
  re-reading the doc (or via the app UI) that no card shows old severity
  data, no saved view's filter/groupBy references it, and the activity log
  has no severity entries.

## System-Wide Impact

- **Interaction graph:** severity's removal ripples `enums.ts` → `types.ts` →
  `filters.ts`/`activity.ts`/`io/*` → `sync/schema.ts`/`board-doc.ts` →
  `commands/catalog.ts`/`card.ts`/`view.ts` → REST (`apps/server/src/routes/commands.ts`)
  and MCP (`apps/mcp/src/tools.ts`), both generated from the catalog → web
  (`badge-row.tsx`, `card-detail.tsx`, `activity.tsx`, `filter-builder.tsx`,
  `views.tsx`, `use-board.ts`) → the seed script → the one-off cleanup script
  (Unit 6), which reaches back into the live Yjs doc itself. The card-face
  relayout (Unit 5) ripples only within `apps/web/components/card/{card.tsx,badge-row.tsx}`
  plus `badges.ts`'s ordering and the `DESIGN.md` card-face description.
- **Error propagation:** zod schemas at each boundary (`io/snapshot.ts`,
  `commands/card.ts`, `commands/view.ts`) simply no longer accept a
  `severity` field, the same way every other removed field is rejected at the
  boundary — no new error-handling paths beyond the `groupKeys`/`groupLabel`
  fallback (Unit 3).
- **State lifecycle risks:** without Unit 6, existing Yjs docs would retain an
  orphaned `severity` key on old card maps, a `badgeConfig`/filter/`groupBy`
  reference, and severity-type activity entries. The plan actively purges all
  of that (Unit 6) rather than leaving it inert, per explicit user direction
  during review. The `groupKeys`/`groupLabel` fallback (Unit 3) remains as a
  defense-in-depth guard for the window before Unit 6 runs.
- **API surface parity (agent-native):** `setCardSeverity` disappears from
  REST and MCP simultaneously with the command-catalog removal — both
  surfaces are generated, so there's no separate agent-facing follow-up.
- **Unchanged invariants:** `priority`, `dueDate`, `checklist`, `labels`,
  `links`, `project`, and `status` fields and their existing UI/command
  behavior are untouched by this plan; only `severity` (fully removed) and
  the card face's line arrangement (Unit 5) change.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A legacy persisted `groupBy: "severity"` on an existing saved view crashes `groupCards` (iterates `undefined`) or renders an `undefined` lane title via `groupLabel` | Explicit fallback added in Unit 3 to both `groupKeys` (ungrouped lane) and `groupLabel` (generic "Ungrouped" title); covered by dedicated tests. |
| `apps/web/components/card/activity.tsx` (a second, UI-layer activity renderer distinct from `packages/domain/src/activity.ts`) is missed during severity removal, leaving a dangling `SEVERITY_META` import | Explicitly listed in Unit 4's file list; `tsc --noEmit` on `apps/web` would catch it regardless. |
| Large mechanical severity removal misses a call site → type/test breakage | TypeScript strict + the existing suites are the safety net (same pattern as the prior `boardId` removal); land Unit 3 (command layer) green before Unit 4 (web) before Unit 5 (relayout). |
| The cmd+K token swap regresses some other surface sharing the same class string | `data-[selected=true]:bg-overlay` in `packages/ui/src/components/command.tsx` is the only consumer of that exact selector (grep-confirmed) — no other component shares it. |
| The glyph-strip fix in Unit 1 re-diverges between `links.tsx` and `link-cluster.tsx` in the future | Extracted into one shared helper both call, instead of duplicating the check. |
| Unit 5 ships before severity is fully gone, leaving a broken empty middle-row edge case | Explicit dependency: Unit 5 sequenced after Units 3 and 4. |
| Unit 6's cleanup script mutates the real account's live board doc — a bug in it (e.g. an over-broad delete) risks real data, not just demo fixtures | Sequenced last (after Units 3-5 are verified green); each mutation is narrowly scoped (delete one known key, filter one known string) rather than a bulk rewrite; idempotent, so a partial/failed run can simply be re-run. |

## Documentation / Operational Notes

- Re-run the demo seed with `SEED_RESET=1` after Unit 4 lands, per
  `[[boardly-seed-demo-account]]`, so the demo account's kitchen-sink card and
  default badge config no longer reference severity, and reflects the Unit 5
  relayout. (This alone fully resets the demo account — Unit 6's cleanup
  script is only needed for the real personal account, which isn't reseeded.)
- Run Unit 6's cleanup script once against the real account after Units 3–5
  are verified; it's a manual operational step, not part of CI.
- Per-unit docs: `docs/units/UNIT-<id>-...md` for each unit above, committed
  with that unit (repo rule §1/§6). `docs/units/UNIT-2.3-priority-severity.md`
  and `docs/units/UNIT-P3-card-face-layout.md` should get a short "superseded
  by" pointer note rather than being deleted, so the historical rationale
  stays discoverable.
- `docs/design/DESIGN.md:279`'s card-face bullet currently says "...severity
  pill, due chip, priority icon..." and describes a single wrapped badge row
  — both are invalidated by this plan (severity is gone; the row becomes
  three fixed lines). Per the repo rule to keep `DESIGN.md` current when a
  change invalidates it, Unit 5 rewrites this bullet as part of landing (see
  Unit 5's file list), not as an optional follow-up.
- Optionally, note in that same section that the cmd+K palette (Unit 2) now
  reuses the same `--bg-selected` + accent-left-border pairing this bullet
  already documents for card-face selection — a nice-to-have cross-reference,
  not required.

## Sources & References

- Request (this session): fix the remaining `→` glyph; restyle from a linked
  Figma file (dropped after discovering it's an unrelated app — see Overview);
  fix cmd+K's low-contrast highlight; remove `severity` completely; relayout
  the card face's first lines.
- Design rules: `docs/design/DESIGN.md` §7.1 (icons), lines 40-48 (hover/selected
  tokens), line 279 (card-face selected-state pairing).
- Prior units: `docs/units/UNIT-2.3-priority-severity.md`,
  `docs/units/UNIT-P3-card-face-layout.md`,
  `docs/units/UNIT-6.4-card-face-link-cluster.md`.
- Prior plan precedent (non-migrated reset — cited for context; this plan's
  own severity data is *actively* purged per Unit 6, not left inert):
  `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md`.
- Document review (2026-07-12): `compound-engineering:document-review` ran
  coherence/feasibility/design-lens passes on this plan and surfaced the
  missing `activity.tsx` file, the `groupLabel` fallback gap, the cmd+K
  layout-shift risk, and the stale `DESIGN.md` bullet — all folded in above —
  plus the stale-saved-view question that led the user to add Unit 6.
- Related code: `packages/domain/src/{enums.ts,types.ts,badges.ts,filters.ts,activity.ts,io/snapshot.ts,io/obsidian.ts,links/registry.ts}`,
  `packages/sync/src/{schema.ts,board-doc.ts}`, `packages/sync/scripts/{seed-demo-board.ts,cleanup-severity.ts}`,
  `packages/commands/src/{catalog.ts,commands/card.ts,commands/view.ts}`,
  `packages/ui/src/components/{command.tsx,dialog.tsx}`, `packages/ui/src/theme.css`,
  `apps/web/components/card/{card.tsx,badge-row.tsx,card-detail.tsx,activity.tsx,links.tsx,link-cluster.tsx,severity-badge.tsx,severity-select.tsx,chip.ts}`,
  `apps/web/components/board/{filter-builder.tsx,views.tsx,badge-config.tsx,swimlanes.tsx,list-view.tsx}`,
  `apps/web/lib/use-board.ts`, `apps/web/components/command-palette/palette.tsx`.
- Memory: `[[boardly-seed-demo-account]]`, `[[boardly-board-collapse]]`,
  `[[boardly-severity-removal-card-polish-plan]]`.
