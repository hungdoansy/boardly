# UNIT 20: Hidden projects excluded from "All"

- **Plan:** `docs/plans/2026-08-09-001-feat-hidden-projects-excluded-from-all-plan.md`
- **Status:** in progress
- **Requirements:** R1–R11 (board visibility, search, preservation)
- **Dependencies:** UNIT-10.5 (project hide/show), UNIT-6.7 (project scope as a filter clause), UNIT-9.5 (filter-aware card creation)

Hiding a project used to hide only the project row. Its cards kept populating the
"All" scope and both search surfaces. This unit makes hiding a project hide its
cards too, and gives search an opt-in way back to them.

## What changed

### Plan unit U1 — `composeBoardFilter` (`packages/domain`)

- **`packages/domain/src/filters.ts`** — new `BoardFilterInput` and
  `composeBoardFilter({ viewFilter, selectedProjectId, hiddenProjectIds })`,
  returning `Filter | undefined`. Placed directly after `deriveCardDefaults` so
  the flattening rule sits beside the function it protects.
- **`packages/domain/src/filters.test.ts`** — 11 new tests under
  `describe("composeBoardFilter")`, including a local `hasProjectExclusion`
  helper that scans recursively so the "explicit scope wins" case proves the
  exclusion's _absence_ structurally rather than by eyeballing a `toEqual`.
- No change needed in `packages/domain/src/index.ts` — it already does
  `export * from "./filters"`.

### Plan unit U2 — wiring the board (`apps/web`)

- **`apps/web/components/app/workspace-app.tsx`** — `MainArea` now reads
  `useArchivedProjects()` and composes through `composeBoardFilter`; the inline
  clause construction and the `isEmptyFilter` collapse are gone. `MainArea` is
  exported so the fan-out can be asserted against the real wiring.
- **`apps/web/lib/use-projects.ts`** — `useProjectActions().archive` counts the
  cards leaving the All view before mutating, then toasts the count and the way
  back. Silent when the project held no cards.
- Tests in `workspace-app.test.tsx` (new `hidden projects are excluded from the
All scope` block), `columns-menu.test.tsx`, `project-list.test.tsx`,
  `project-settings.test.tsx`.

### Plan unit U3 — project context in the search index (`apps/web`)

- **`apps/web/components/search/search-index.ts`** — `SearchDoc` gains
  `projectId?`, `projectName?`, and a required `projectHidden`.
- **`apps/web/components/search/use-search.ts`** — `useSearchDocs` takes
  `{ includeHidden = false }` and drops hidden-project docs when it is false, so
  both surfaces inherit the exclusion from one place. Names resolve from both
  project lists.
- Tests in `search.test.tsx`, including a guard that project context never
  affects ranking.

### Plan unit U4 — the ⌘K palette (`apps/web`)

- **`apps/web/components/search/hidden-project-marker.tsx`** (new) —
  `HiddenProjectMarker({ doc })`, self-gating on `doc.projectHidden`, shared by
  both search surfaces.
- **`apps/web/components/command-palette/palette.tsx`** — an "Include hidden
  projects" toggle row, rendered only when the board has a hidden project;
  results carry the marker. The ⌘K handler now routes through `setOpenState`
  instead of a bare `setOpen((o) => !o)`.
- **`docs/design/DESIGN.md`** — new §7.5 binding the palette toggle-row pattern
  and the marker, plus a §7 table row. Nothing added to §5's global-keys list.
- Tests in `palette.test.tsx`.

## Why

- **One clause, composed once.** `matchesClause` already implements `project` +
  `isNot` as "the card has no project, or its project is not in this list" —
  exactly the rule this unit needs, including keeping unassigned cards visible.
  Composing it beside the existing project-scope clause means the board, list
  view, swimlanes, per-status counts, and the column bulk actions inherit the
  exclusion with no new plumbing. That is the same reasoning UNIT-6.7 used for
  project scope, and the invariant UNIT-9.6 / UNIT-14 / UNIT-19 each restated:
  the header count, the rendered cards, and the bulk-action id set derive from
  one filter by construction, so they cannot drift.

  Rejected: filtering in `packages/sync`'s card listing (it would also hide
  cards from the agent/REST/MCP surface, which is not the intent), and
  filtering per component (it reintroduces exactly the drift UNIT-9.6 removed).

- **A pure function, not an inline memo.** `MainArea` is not exported and has no
  test coverage. Pushing the composition into `packages/domain` matches what
  this file already does with `resolveView`, `countByStatus`, and
  `visibleCardIdsByStatus`, and gives the flattening rule below a tested home.

- **The exclusion is appended to an AND view filter, never wrapped around it.**
  `deriveCardDefaults` reads only the _direct_ clauses of a top-level AND group
  and skips nested ones. Wrapping the view filter in a new AND group would have
  silently stopped a `priority is High` view from seeding new cards — UNIT-9.5's
  behavior, and the likeliest silent break in this whole unit. An OR view filter
  still nests, because spreading its arms would AND them.

- **An explicit project scope beats the exclusion.** Applying both would produce
  `project is X AND project isNot [X, …]` — an empty board — and would remove
  the only route to a hidden project's cards besides search. So
  `hiddenProjectIds` is ignored whenever a project is selected, leaving that
  branch byte-identical to its pre-UNIT-20 behavior.

- **The hidden-id array is collapsed to a scalar key.** `useArchivedProjects()`
  returns a fresh array on every deep change to the projects map, so depending
  on it directly would rebuild the filter — and invalidate every memo below it —
  on an unrelated project rename or recolor. The ids are derived back _from_ the
  key, so `react-hooks/exhaustive-deps` stays satisfied honestly rather than
  suppressed. JSON rather than a joined string, because `createProject` accepts
  a caller-supplied free-form id and no separator character is safe to split on.

- **The hide toast lives in the action, not the two call sites.** Both the
  sidebar context menu and the Settings row call the same
  `useProjectActions().archive`, and the count has to be read from the doc
  _before_ the mutation. Emitting from each component would have duplicated the
  message and pushed `allLiveCards` into two components; one implementation
  covers both entry points, and the count is read non-reactively so sizing a
  toast does not make either entry point subscribe to every card on the board.
  The restore path is spelled in words — a `→` breadcrumb separator is a banned
  glyph (DESIGN.md §7.1) and a toast body is a plain string with nowhere to put
  an SVG.

- **The search index resolves project names from both lists.** A hidden project
  is absent from `listProjects` — the list every other card surface reads — so
  resolving from it alone would leave the name undefined for exactly the cards
  that need to be marked with it. `useSearchDocs` merges `listProjects` and
  `listArchivedProjects` inside its existing memo, adding no second
  subscription.

- **Project context is display-only.** No `FIELD_WEIGHT` entry, so ranking is
  byte-for-byte unchanged and the existing assertions pass untouched. A guard
  test pins this: a doc whose only match is in `projectName` must not rank.
  Making project name searchable is deferred.

- **The toggle row is force-mounted, and keeps cmdk's `option` role.** The
  palette leaves `shouldFilter` on, so a plain `CommandItem` is filtered away
  the moment the user types — exactly when the toggle has a job. cmdk also
  hardcodes `role="option"` after spreading caller props, so a supplied
  `role="menuitemcheckbox"` is silently discarded; state rides on `aria-checked`
  instead, and only the visual half of DESIGN.md §7's multi-toggle pattern is
  reused. Both facts were verified against cmdk 1.1.1's source, and the
  force-mount guard was proven by removing it and watching exactly the two
  query-typed tests fail. Mechanics:
  `docs/solutions/integration-issues/cmdk-non-result-rows-in-the-two-palettes.md`.

- **`Eye` on the control, `EyeOff` on the marker.** The toggle _reveals_, so it
  takes the same glyph as `project-settings.tsx`'s Show action; a checked
  `EyeOff` row would read as "hiding is on". The marker reports a _state_ — this
  card's project is hidden — which is the vocabulary the hide actions already
  use. The marker is not §7.3's project `Box`: that glyph carries the project's
  color, which a `SearchDoc` does not, and the row is marking hiddenness, not
  identity.

- **Reset on open, not on close.** `palette.tsx` had several close paths that
  bypassed the `setOpenState` wrapper. Resetting on the open transition makes
  the toggle immune to all of them at once, rather than patching each call site.

## How it works

`composeBoardFilter` resolves three cases:

| Selected scope | Hidden projects | Result                                                                               |
| -------------- | --------------- | ------------------------------------------------------------------------------------ |
| A project      | any             | `project is [id]` ANDed with the view filter — unchanged from before this unit       |
| All            | none            | the view filter, by reference; `undefined` when it is empty                          |
| All            | one or more     | `project isNot [hidden ids]` appended to the view filter's own top-level AND clauses |

Returning `undefined` for the empty case is part of the contract, so callers
hand the result straight to `countByStatus` / `visibleCardIdsByStatus` /
`resolveView` without re-checking.

The no-hidden-projects path returns the caller's exact `viewFilter` reference
(pinned with `toBe` in the tests). The composer therefore introduces no new
object identity on the most common path — which matters because every memo
below it keys on the filter.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/domain test` → 146 passed (was 135).
- **Gates:** `pnpm --filter @boardly/domain typecheck` and `lint` clean.
- The OR-nesting test catches accidental spreading behaviorally, not just
  structurally: a spread OR would AND its arms, so a `priority is High` card
  with no `bug` label would silently vanish from the board.

## Follow-ups / known gaps

Tracked in the plan's Deferred section. The ones worth repeating here:

- The card detail sheet resolves projects from `listProjects` only, so a
  hidden-project card reads "No project" and can be silently reassigned.
  Pre-existing since UNIT-10.5, but this unit makes search the normal way those
  cards get opened.
- `searchCards` returns no `projectId` and the command catalog has no
  archived-project listing, so an agent asked to skip hidden projects cannot
  comply. The agent surface stays global by choice — see the plan's KTD7.
