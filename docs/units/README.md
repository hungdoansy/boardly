# Per-Unit Change Docs

Every implementation unit in a build/refactor plan gets one intensive doc here, so the codebase is
understandable without spelunking. This is required by `CLAUDE.md` §1 and is part of each unit's
Definition of Done.

## Plans → unit-doc ranges

Unit docs are named after the unit id in their plan (ids are scoped per plan, so a later plan may
reuse a number namespace). The plans, newest last:

- `docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` — the original full build:
  `UNIT-0.x` (scaffold) · `UNIT-1.x`–`UNIT-5.x` (core → sync → depth → desktop/e2e) · plus
  `UNIT-V1.x` (shared view model / filters / list), `UNIT-F1`/`UNIT-F2` (focus/zen mode), and
  `UNIT-P1`/`UNIT-P2` (card-drawer polish, demo seed).
- `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` — integer ticket ids,
  single main board, deep-link URLs, card-face link cluster + reorder, projects, settings:
  `UNIT-6.1`–`UNIT-6.8`.
- `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` — collapse the board
  layer into one per-user space and adopt the fixed Linear status columns:
  - `UNIT-7.1` — sync: one per-user board doc (`board:{userId}`); delete the workspace index.
  - `UNIT-7.2` — server: authorize the doc by user id; drop the `boards` table and `/boards`.
  - `UNIT-7.3` — commands: drop `boardId`; context resolves the single doc; prune board commands.
  - `UNIT-7.4` — server REST + MCP: align the agent surface to boardId-less commands.
  - `UNIT-7.5` — web data layer: per-user doc keyed by the authenticated user; simplify sync-bridge.
  - `UNIT-7.6` — web hooks + components: drop `boardId`, remove provisioning/selection.
  - `UNIT-7.7` — domain + sync: eight statuses, collapse `columnId` into `status`, `showEmptyColumns`.
  - `UNIT-7.8` — commands: remove column commands; `moveCard` sets status; add `setShowEmptyColumns`.
  - `UNIT-7.9` — web board: render fixed status columns; drag sets status; show/hide-empty toggle.
  - `UNIT-7.10` — web: Settings placement and the ESC escape ladder.
  - `UNIT-7.11` — docs: rewrite `PLAN.md` + `DESIGN.md` + this index; rewrite the demo seed (this doc).
- `docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md` — glyph→SVG fixes, cmd+K
  contrast fix, remove `severity` end-to-end, relayout the card face into three fixed lines:
  - `UNIT-1` — strip the remaining Unicode glyphs (link-cluster tooltip, filter-builder checkmark).
  - `UNIT-2` — fix the cmd+K palette's selected-row contrast (`bg-overlay` → `bg-selected`).
  - `UNIT-3` — remove `severity` from domain, sync, and the command layer (REST/MCP follow via the catalog).
  - `UNIT-4` — remove `severity` from the web UI and the demo seed script.
  - `UNIT-5` — relayout the card face into three fixed lines (ticket id/deadline/checklist, labels, priority/links/project).
  - `UNIT-6` — one-off script to purge persisted `severity` data from the real account.

## Convention

- **Filename:** `UNIT-<id>-<slug>.md` — e.g. `UNIT-1.1-yjs-schema.md`, `UNIT-3.10-mcp-server.md`.
- **When:** write it _before or during_ implementation (docs-first is encouraged). If written first,
  **commit the doc before continuing** to code. The doc must be committed by the time the unit's
  plan checkbox is ticked.
- **Depth:** intensive — a new contributor should understand what/why/how and how to verify from the
  doc alone. Link to the code, don't paste large blocks.
- **Design:** for any UI unit, record the design decisions here and confirm adherence to
  `docs/design/DESIGN.md` (tokens used, transitions added, dark-mode screenshot reference).

## Template

```markdown
# UNIT <id>: <title>

- **Plan unit:** <id> (link to the plan section)
- **Status:** in progress | done
- **Requirements:** R#, R#
- **Commit(s):** <hashes>

## What changed

- Files created/modified/deleted (repo-relative) and the public surface (commands, components, APIs, schema) added or altered.

## Why (decisions)

- Key decisions and rationale. Rejected alternatives when non-obvious.

## How it works

- Mechanism, data flow, edge-case handling. Diagrams/sketches if useful.

## Design (UI units)

- Tokens/components used (per DESIGN.md), transitions added and their durations/easing, dark-mode screenshot path/description, a11y notes.

## How to test / verify

- Unit tests written (paths) and what they assert.
- e2e/manual checks; for UI, what "correct" looks like vs DESIGN.md.
- Commands to run (outcomes, not brittle recipes).

## Follow-ups / known gaps

- Anything deferred or to revisit.
```
