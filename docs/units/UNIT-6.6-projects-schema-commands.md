# UNIT-6.6 — Projects: schema + command layer

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 6).

## What changed

Introduced **projects** — a grouping layer under the single board (a card belongs to at most one project). This unit is the data + command layer only; the sidebar UI and settings management come in Units 6.7 and 6.8.

- **`packages/domain/src/types.ts`** — added `Project { id, name, color, ord, archived }`; added optional `projectId?: Id` to `Card`.
- **`packages/sync/src/schema.ts`** — added `boardProjects(doc)` accessor (a top-level `projects` Y.Map) and `projectToPlain`; `cardToPlain` now surfaces `projectId` when set.
- **`packages/sync/src/board-doc.ts`** — projects modeled exactly like labels (id-keyed Y.Map, fractional `ord`, soft-archive):
  - `addProject` / `renameProject` / `recolorProject` / `archiveProject` / `listProjects` (non-archived, ord-sorted).
  - `setCardProject(cardId, projectId | null)` — assign or clear.
  - `addCard` gained an optional `projectId`.
- **`packages/commands/src/commands/project.ts`** (new) — `createProject` (defaults color to `DEFAULT_LABEL_COLOR`), `renameProject`, `recolorProject`, `archiveProject`, `listProjects` (exported as `listProjectsCommand`), `setCardProject`. `createCard` extended with an optional `projectId`.
- Registered all six in `packages/commands/src/catalog.ts` and exported the module from `packages/commands/src/index.ts` — so the MCP/REST agent surface gains them automatically (agent-native parity, plan R13).

## Why

- Product decision (user, R3): the user wants multiple projects as a grouping. Per the mid-plan revision, projects carry **no identity semantics** — the ticket prefix/number is board-level (Unit 6.1), so a project is just `name` + `color` + `ord`.
- **Mirror labels**: labels are the proven pattern for a board-scoped, id-keyed, soft-archivable collection with fractional ordering. Reusing it keeps the code consistent and merge-safe.
- **Soft-archive, don't reparent**: like column deletion, archiving a project leaves each card's `projectId` untouched (the card simply falls out of any project-scoped view). Avoids a destructive rewrite and is CRDT-friendly.
- **One project per card** (single `projectId`, not a set): projects are a mutually-exclusive grouping, unlike labels.

## How it works

`boardProjects(doc)` is a `projects` Y.Map keyed by project id. `addProject` appends with a fractional `ord` after the last live project. `listProjects` filters out archived and sorts by `ord`. A card stores `projectId` as a plain string key; `setCardProject(..., null)` deletes it. `createCard`/`addCard` can set it at creation.

## How to test / verify

- **Command tests** (`packages/commands/src/commands/project.test.ts`, green):
  - create → default color + appears in `listProjects`.
  - rename + recolor persist.
  - archive → hidden from `listProjects`, but a card's `projectId` is retained.
  - `createCard({ projectId })` sets it; `setCardProject` changes it; `setCardProject(null)` clears it.
- `catalog.test.ts` (green): all six new commands registered, unique by name (dynamic count assertion).
- Typecheck + lint + tests (domain/sync/commands) + web typecheck + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.

Not a user-facing unit (no rendered UI yet), so no browser screenshot — the projects sidebar/filter (Unit 6.7) and settings management (Unit 6.8) will be verified visually.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

## Follow-ups / known gaps

- **Import/export does not yet carry projects.** `boardToSnapshot`/`buildBoardFromSnapshot` (Unit 4.4) don't serialize the projects list, and the snapshot `cardSchema` doesn't include `projectId`, so a whole-board JSON round-trip currently drops project grouping. Add project export/import when projects are considered stable (out of scope for this unit; the round-trip test has no projectId fixtures, so it stays green).
- No per-card project UI or sidebar yet — Unit 6.7.
