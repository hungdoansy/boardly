# UNIT-P6 — Project select in the card detail drawer

Requested interactively: a card's project could only be set at creation time (inherited
from the sidebar's active project scope) or never at all — there was no way to assign or
change a card's project after the fact.

## What changed

- **`apps/web/components/card/project-select.tsx` (new)** — `ProjectSelect`, a
  `Popover`-based single-select picker modeled on `PrioritySelect`/`StatusSelect`. Props:
  `value: string | undefined` (the card's `projectId`), `projects: Project[]`, and
  `onChange(projectId: string | null)`. Renders a "No project" option first, then each
  project as a `Box` icon (matching `ProjectChip`) tinted with the project's color + name,
  with a `Check` mark on the active selection.
- **`apps/web/lib/use-board.ts`** — added `setProject(cardId, projectId: string | null)`
  to `CardActions`, wired to the existing `setCardProject` command from `@boardly/commands`
  (the command already existed, unused by the web app until now).
- **`apps/web/components/card/card-detail.tsx`** — `PropertyList` gained a `Project` row
  (after Due), calling `useProjects()` for the option list and rendering `ProjectSelect`.

## Why

- Followed the existing `StatusSelect`/`PrioritySelect` pattern exactly (popover +
  `menuitemradio` rows) rather than inventing a new picker shape — same interaction model
  as every other property in the drawer.
- Needed an explicit "No project" entry because `setCardProject` accepts `projectId: string
  | null` (unset is a valid, common state — see `Card.projectId?: Id` in
  `packages/domain/src/types.ts`), unlike `PrioritySelect`/`StatusSelect` which always have a
  concrete value.

## How it works

`ProjectSelect` resolves `value` against the `projects` list to find the selected `Project`
(or `null` if unset/archived-and-filtered-out). Selecting a row calls `onChange` with the
project id or `null`, then closes the popover. `card-detail.tsx` wires this straight through
`actions.setProject`, which executes the pre-existing `setCardProject` command — no new
command or sync-layer change was needed.

## How to test/verify

- `pnpm --filter web exec tsc --noEmit` — clean.
- Manual, dark mode, against the seeded demo board (`demo@boardly.app`): opened BRD-3
  ("Design the mobile card layout"), confirmed the drawer's Properties section shows a
  Project row reading "Web app"; opened the picker and confirmed all projects (No project,
  Web app, Platform, Docs) list with their colored box icons and a checkmark on the current
  selection; selected "Platform" and confirmed both the drawer and the card face badge
  updated immediately; reverted to "Web app" to leave the seed data unchanged.

## Follow-ups / known gaps

- No unit/component test added for `ProjectSelect` (matches the drawer's other selects,
  none of which have dedicated tests either — coverage relies on `card-detail` integration
  tests if/when they're added).
