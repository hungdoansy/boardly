# UNIT 2.2: Labels (board palette + card assignment)

- **Plan unit:** 2.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R6, R7
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.2-labels-dark.png`

## What changed

A per-board colored label palette; assign/unassign labels to cards; chips on the card face and in the
detail panel. This is also where the **label commands deferred from Unit 1.7** land.

- `packages/domain/src/palette.ts` — `LABEL_COLORS` (the DESIGN §2 accessible-on-dark palette) +
  `DEFAULT_LABEL_COLOR`.
- `packages/sync` — `labelToPlain` converter; accessors `addLabel`, `renameLabel`, `recolorLabel`,
  `deleteLabel`, `assignLabel`, `unassignLabel`, `listLabels`. Delete removes the label from the board
  palette **and** strips it from every card's set (no dangling ids).
- `packages/commands/src/commands/label.ts` — `createLabel`, `renameLabel`, `recolorLabel`,
  `deleteLabel`, `assignLabel`, `unassignLabel` + catalog/index; `label.test.ts` (create/assign/
  unassign, rename-by-id, delete-strips-from-cards).
- `packages/ui` — `Popover` (Radix) primitive (`@radix-ui/react-popover 1.1.19`).
- `apps/web/components/card/labels.tsx` — `LabelChip` + `CardLabels` (assigned chips + a popover to
  toggle assignment and create-and-assign a new label with a color swatch).
- `apps/web/components/board/label-manager.tsx` — `LabelManager` (board palette: inline rename, color
  swatches to recolor, delete) — mounted from a **Labels** popover in the board top bar.
- Wiring: `CardLabels` in the card detail panel; `LabelChip`s on the card face (via a
  label-id→Label map in `ColumnCards`/`BoardView`); `useLabels` + `useLabelActions` hooks.
- Test: `apps/web/components/card/labels.test.tsx`.

## Why (decisions)

- **Reference labels by id everywhere** (the Focalboard lesson): card sets store `labelId → true`;
  rename/recolor mutate the palette entry, so every card carrying it updates automatically. Proven by
  the rename-propagation test.
- **Delete strips from all cards** in one transaction — no dangling ids in any card set or the UI.
- **All mutations through the command layer** (label commands from 1.7's deferred file); the UI never
  calls sync accessors directly (agent parity).
- **Create-and-assign in one popover** (Linear-style): the card's label popover both toggles existing
  labels and creates a new one (pre-picked color) already assigned — the common flow in one place.
  Full palette management (rename/recolor/delete) lives in the board-level `LabelManager`.
- Chips use `color-mix(... 16% ...)` fill + full-color dot/text (DESIGN §2).

## Design (per DESIGN.md)

- Palette = the 10 named colors from DESIGN §2. Chips: `--radius-sm`, `text-xs`, low-alpha fill,
  colored dot. Popovers use the `Popover` token styles (bg-popover, border, shadow, fade/zoom
  animation). Swatches show an accent ring when selected; every control has a `focus-visible` ring.
- Dark screenshot: `docs/units/screenshots/UNIT-2.2-labels-dark.png` (card face + detail with
  violet "design" + blue "research" chips).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/commands test` — label commands: create/assign/unassign; rename by id;
  **delete removes from palette AND from every card**.
- `pnpm --filter @boardly/web test` (36) — CardLabels: create+assign; unassign from popover; **rename
  propagates to the card chip by id**; **delete removes the chip**; LabelManager inline rename.
- **Critical flow (Playwright, dark):** open a card → create + assign two colored labels → chips show
  on the card face and detail; screenshot vs DESIGN.md.
- Full gates: typecheck 7/7, lint 7/7, test (domain 15 / sync 17 / commands 7 / ui 2 / web 36),
  `pnpm --filter @boardly/web build` valid, `format:check` clean.

## Follow-ups / known gaps

- The card-face label chips are a standalone row now; Unit 2.6 folds labels into the configurable
  **badge row** alongside severity/due/links.
- `LabelManager` recolor uses a compact inline swatch strip per row; a fuller color picker could
  replace it later.
