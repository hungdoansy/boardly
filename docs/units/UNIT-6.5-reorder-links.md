# UNIT-6.5 — Reorder links in the ticket drawer

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 5).

## What changed

Links on a card can now be reordered from the card drawer, and the order flows through to the card-face `LinkCluster` (Unit 6.4), which already renders in `link.ord` order.

- **`packages/sync/src/board-doc.ts`** — added `moveLink(doc, cardId, linkId, neighbors, clientId, now)`: sets the link's fractional `ord` to `keyBetween(after, before)`, mirroring `moveChecklistItem`/`moveCard`. Single typed write, merge-safe.
- **`packages/commands/src/commands/link.ts`** — added the `moveLink` command (`boardId, cardId, linkId, afterId?, beforeId?`), returning the updated card. Registered in `packages/commands/src/catalog.ts` (so the MCP/REST agent surface gets it too — agent-native parity).
- **`apps/web/lib/use-board.ts`** — `LinkActions` gains `move(cardId, linkId, neighbors)`; `useLinkActions` wires it to the command.
- **`apps/web/components/card/links.tsx`** — each drawer link row gets **Move up / Move down** chevron controls (disabled at the boundaries), mirroring the checklist's accessible reorder pattern. The neighbor computation matches the checklist: moving down places the link between the next two links, moving up between the previous two.

## Why

- Product decision (user, R8): control the order links appear in — and since the card face shows the first 5 in order (Unit 6.4), reordering lets the user choose which links surface on the card.
- **Fractional `ord` via `keyBetween`** is the established ordering primitive for cards, columns, and checklist items — reusing it keeps reordering merge-safe across concurrent edits with a single write (no array rewrite).
- **Up/down chevrons** rather than drag: this matches the sibling `Checklist` component exactly, is fully keyboard-operable (repo a11y goal), and is reliable to test. `@dnd-kit/sortable` drag could be layered on later without changing the command/sync layer.

## How it works

`links.tsx` renders `card.links` (already `ord`-sorted in `cardToPlain`). Each row's Move up/down buttons call `actions.move(cardId, linkId, { afterId, beforeId })` with the neighbors one slot further out; the `moveLink` command → `syncMoveLink` computes a new `ord` strictly between them. `useY` re-renders the drawer and the card face in the new order.

## How to test / verify

- **Sync unit test** (`packages/sync/src/board-doc.test.ts`, green): `moveLink` reorders a link between neighbors (`[l1,l2,l3]` → move l1 down → `[l2,l1,l3]`) and can move a link to the very start.
- **Drawer integration test** (`apps/web/components/card/links.test.tsx`, green): renders the real `CardLinks` over a memory-backed board with three titled links, asserts the first link's "Move up" is disabled, and that clicking "Move Alpha down" reorders to `[Beta, Alpha, Gamma]` through the command + sync layers. This exercises the exact UI a browser check would.
- Command registration covered by `packages/commands/src/catalog.test.ts`.
- Typecheck + lint + full web suite (153 tests) + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

### Browser verification note

No live screenshot this iteration — the browser-pane dev server remained unstable (see UNIT-6.4). The reorder behavior is covered by the `links.test.tsx` rendering test, which mounts the actual drawer component and drives the real move controls end-to-end, so it provides equivalent confidence to a manual click-through.

## Follow-ups / known gaps

- Pointer drag-and-drop (`@dnd-kit/sortable`) is not implemented; reordering is via the up/down controls (keyboard + click). The command/sync layer already supports arbitrary neighbor moves, so adding drag later is a UI-only change.
