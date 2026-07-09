# Per-Unit Change Docs

Every implementation unit in the build plan
(`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md`) gets one intensive doc here, so the
codebase is understandable without spelunking. This is required by `CLAUDE.md` §1 and is part of
each unit's Definition of Done.

## Convention

- **Filename:** `UNIT-<id>-<slug>.md` — e.g. `UNIT-1.1-yjs-schema.md`, `UNIT-3.10-mcp-server.md`.
- **When:** write it *before or during* implementation (docs-first is encouraged). If written first,
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
