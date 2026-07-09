# UNIT 2.5: Checklist / sub-tasks

- **Plan unit:** 2.5 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R6
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.5-checklist-dark.png`

## What changed

Add checklist items to a card with toggle-done, inline edit, delete, and reordering; a progress
count (n/m) + bar.

- `packages/sync/src/board-doc.ts` — checklist accessors over `card.checklist`
  (`Y.Map<itemId, Y.Map{text,done,ord}>`): `addChecklistItem`, `toggleChecklistItem`,
  `setChecklistItemText`, `deleteChecklistItem`, `moveChecklistItem` (fractional `ord`).
- `packages/commands/src/commands/card.ts` — the five matching commands (+ catalog).
- `apps/web/lib/use-board.ts` — `useChecklistActions` (add/toggle/setText/remove/move).
- `apps/web/components/card/checklist.tsx` — `Checklist` (progress `n/m` + bar, add field) and
  `ChecklistRow` (accent checkbox, inline-edit text, hover move-up/down + delete, strikethrough when
  done).
- Wiring: a **Checklist** section in the card detail; a compact `n/m` progress badge on the card face.
- Test: `apps/web/components/card/checklist.test.tsx`.

## Why (decisions)

- **Each item is a nested `Y.Map`** keyed by id (id = the map key; `text`/`done`/`ord` inside),
  matching the schema `cardToPlain` already reads — so no schema change, and concurrent edits to
  different items merge.
- **Reorder via fractional `ord`** (like everything else) — `moveChecklistItem` writes a single `ord`
  between neighbor ords. The UI computes neighbor ids for move-up/down from the current order.
- **Move up/down buttons rather than drag** — the checklist lives inside the card-detail Sheet;
  buttons are keyboard-accessible and avoid nesting another DnD context in a portal. (Drag could be
  added later.)
- **Progress derived, not stored** — `done`/`total` computed from the items each render (derive,
  don't sync); the indicator is hidden when the checklist is empty.
- **All mutations through the command layer** (agent parity); inline text edits commit on blur/Enter
  and ignore empty.

## Design (per DESIGN.md)

- Accent-colored native checkbox; done items dim + strike through; a thin `--success` progress bar;
  hover-revealed row controls (`opacity`/`--dur-fast`); token inputs with accent focus rings. Card
  face shows a `ListChecks` icon + `n/m`.
- Dark screenshot: `docs/units/screenshots/UNIT-2.5-checklist-dark.png` (1/3 done, one item checked).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test` (47):

- Add items → progress `0/2`; toggle → `1/2`.
- Delete the only item → the progress indicator disappears (empty checklist).
- Reorder (move-up on the 2nd item) → doc checklist order becomes `["Second","First"]`.
- Full gates: typecheck 7/7, lint 7/7, test (domain 23 / sync 17 / commands 7 / ui 2 / web 47),
  `pnpm --filter @boardly/web build` valid, `format:check` clean. Playwright: add 3 items, toggle one
  → `1/3` + progress bar; dark screenshot vs DESIGN.md.

## Follow-ups / known gaps

- Drag-to-reorder for checklist items (currently move up/down buttons).
- The command-layer catalog now includes the checklist commands; a dedicated command-level test can
  be added if desired (behavior is covered via the UI test today).
- Card-face checklist badge is standalone; folds into the badge row config in Unit 2.6 if wanted.
