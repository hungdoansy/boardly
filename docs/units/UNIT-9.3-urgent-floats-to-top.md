# UNIT-9.3 — Urgent floats to the top of its column

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 7).

## What changed

Setting a card's priority to **Urgent** now moves it to the top of its status column — once — and a
card **created** as Urgent lands at the top too. Both are handled in the shared sync layer so every
caller (drawer priority picker, board keyboard priority-cycle, agent command) inherits the behavior.

- **Sync** (`packages/sync/src/board-doc.ts`):
  - New `minOrd(ords)` helper (complements `maxOrd`).
  - `setCardPriority` gains a `clientId` parameter (before `actor`). On a **non-urgent → urgent**
    transition it re-slots the card's `ord` to before the smallest `ord` among the other live
    cards in its status (`keyBetween(null, minOrd(others), clientId)`). Any other transition
    leaves `ord` untouched.
  - `addCard` accepts an optional `priority`; when it is `Urgent` the new card is slotted at the
    top (`keyBetween(null, minOrd(existing), clientId)`) instead of appended.
- **Commands** (`packages/commands/src/commands/card.ts`): the `setCardPriority` command passes
  `ctx.clientId` through to the sync function.
- **Callers updated for the new signature:** `packages/sync/scripts/seed-demo-board.ts` and the
  direct sync-test callers (`activity.test.ts`, `io.test.ts`, `board-doc.test.ts`).

## Why

- The user chose "move once when set" over a permanent display-time sort. A one-time `ord` re-slot
  keeps the card freely draggable afterwards and never fights drag-and-drop neighbor math (which
  reads the same `ord` order).
- Putting it in the shared `setCardPriority`/`addCard` (not the command) means the drawer picker,
  the board's `p`/priority-cycle keyboard action, and the agent command all get identical behavior
  with no per-caller code.
- Handling the created-Urgent case in `addCard` keeps the invariant consistent between "create as
  Urgent" (used by filter-seeding in UNIT-9.5) and "transition to Urgent".

## How it works

`minOrd` finds the current top card's fractional key; `keyBetween(null, topOrd, clientId)`
produces a strictly-smaller key, so the card sorts first under `byOrd`. Because it is a normal
`ord` write, a later drag re-slots it like any other card. The transition guard
(`from !== Urgent && to === Urgent`) makes the float fire exactly once — re-setting Urgent, or
setting any non-urgent priority, does not reorder.

## How to test / verify

- **Unit tests (all green), `packages/sync/src/board-doc.test.ts` (`urgent floats to top`):**
  - Setting a mid-column card to Urgent moves it to the top (`[A,B,C]` → set C → `[C,A,B]`).
  - Creating a card with `priority: Urgent` places it first.
  - Setting a non-Urgent priority does not reorder.
  - Re-setting an already-Urgent card does not reorder (and doesn't crash).
  - Two cards set Urgent in sequence → the most-recent is at the very top.
  - The only card in a column (no neighbors) is handled without error.
- Existing priority/activity tests updated for the new `clientId` arg and still pass
  (`activity.test.ts`, `io.test.ts`).
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e`
  DOM-lib break, unrelated); lint clean; `vitest run` = 417 passed / 37 skipped; `@boardly/web`
  build compiles. No user-facing UI added, so no dark-mode screenshot applies.

## Follow-ups / known gaps

- The float is tied to the priority **transition** only; dragging an Urgent card down later, or
  moving it between columns, does not re-float it (intended — the user can place it manually).
