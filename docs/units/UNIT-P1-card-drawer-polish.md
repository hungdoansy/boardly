# UNIT P1: Card drawer + composer UI polish

- **Plan unit:** none (post-plan polish requested directly by the user, 2026-07-11)
- **Status:** done
- **Requirements:** DESIGN.md (hover/focus/disabled states, measured motion), agent-native parity unaffected
- **Commit(s):** _this unit's commit_

## What changed

Four small, user-reported UI fixes on the board composer and the card-detail drawer.

1. **"Add card with details" button.** `CardComposer` gained an optional `onCreateDetailed`
   callback; when provided it renders a second, icon-only button (`PanelRight`) to the right of
   **+ Add card**. `ColumnCards` wires it to `onOpenCard(actions.create(columnId, "New card"))` —
   one click creates a card **and** opens its detail drawer, so links/checklist/etc. can be added
   without the create → click → edit round-trip.
2. **Composer input no longer clipped.** The expand-to-type `<input>` used an outset `ring-1`
   flush against the column's `overflow-y-auto` padding edge, so the ring's left/right pixels were
   clipped. It now uses `w-full` + an in-box `border-[var(--accent)]` (no outset ring), so it fills
   the column and never clips.
3. **Consistent hover/disabled states, from the base components.**
   - New **`Input`** primitive in `@boardly/ui` (`packages/ui/src/components/input.tsx`): border
     (not outset ring) + `hover:border-line-strong`, `focus-visible` accent border+ring,
     `disabled:opacity-50`. Adopted by the Links and Checklist "add" fields.
   - New **`iconSm` (`size-7`) Button size** so the "add" buttons can be the base `Button`
     (`variant="primary"`), which already carries hover/active/`disabled:opacity-50`. They now
     **disable when their input is empty** (Links, Checklist).
   - Checklist move/delete and Links remove buttons gained a `hover:bg-overlay`, a `focus-visible`
     ring, and `transition-colors` (previously colour-only, no background, no visible focus).
   - The drawer's **Archive card** control is now the base `Button` (`variant="ghost"`), so it
     shares the standard hover/focus treatment.
4. **Activity rows aligned.** Each row's icon and timestamp are now boxed to the text's line height
   (`h-5` + `place-items-center` / `leading-5`) instead of a hand-tuned `mt-0.5`, so the icon,
   label, and time share one baseline on the first line.

Files: `packages/ui/src/components/{button,input}.tsx`, `packages/ui/src/index.ts`,
`apps/web/components/card/{card-composer,links,checklist,activity,card-detail}.tsx`,
`apps/web/components/board/column-cards.tsx`, tests in `apps/web/components/card/card.test.tsx`,
e2e helper `apps/e2e/tests/helpers.ts`.

## Why

- **Base-component-first (user's explicit ask).** Rather than patch each drawer widget, the
  recurring input+add-button pattern now resolves to `Input` + `Button`, so hover/disabled/focus
  are defined once and inherited. This keeps the drawer consistent and future widgets cheap.
- **Border over outset ring.** An outset `ring` renders outside the box and is clipped by any
  `overflow` ancestor; a border lives in-box (border-box) and never clips — the correct primitive
  for inputs that sit inside scroll containers.
- **`create("New card")` for the detailed add.** `createCard` requires a non-empty title
  (`z.string().min(1)`), so the detailed-add seeds `"New card"`; the drawer's title field is
  immediately editable. Mirrors the existing "New board" default.

## How it works

`CardComposer` stays a two-state control (collapsed button row ↔ expanded input). The collapsed
state is now a flex row: the full-width **Add card** button (keeps `data-nav-composer` for keyboard
nav) plus the optional details icon button. The details button calls `onCreateDetailed`, which in
`ColumnCards` returns the new card id from the command layer and passes it to `onOpenCard` — the
same path a normal card click uses, so the Radix Sheet opens on the freshly created card.

## How to test / verify

Prereqs: Node 22.17.1; Docker `boardly-db` up.

- **Unit/gates:** `pnpm --filter @boardly/ui --filter @boardly/web typecheck` ✓;
  `-r lint` ✓ (ui + web); `prettier` clean; `pnpm --filter @boardly/web test` → **132 passed**
  (added a test: the details button creates a card and calls `onOpenCard` with its id);
  `pnpm --filter @boardly/ui test` ✓; `pnpm --filter @boardly/web build` static export compiles.
- **Dark-mode visual (per DESIGN.md):** verified via a throwaway Playwright spec against the dev
  server (dark) — the composer shows the details icon button; the expanded input is full-width and
  un-clipped; the details button opens the drawer on a "New card"; Links/Checklist add buttons are
  disabled when empty (asserted `toBeDisabled()`); Activity rows are baseline-aligned. `card.spec`
  (uses the `addCard` helper) passes in isolation.
- **e2e helper:** `addCard` now matches **`{ name: "Add card", exact: true }`** so it isn't
  ambiguous with the new "Add card with details" button (Playwright role-name is substring by
  default).

## Follow-ups / known gaps

- Other drawer inputs (WIP limit, view name, column/card rename) still hand-roll their field
  styling; they could migrate to the `Input` primitive in a later sweep.
- The detailed-add seeds the literal title `"New card"`; it does not auto-select the title text on
  open. Auto-focus/select could be a nice follow-up but needs the drawer to distinguish a
  detailed-create from a normal open.
