# UNIT-9.2 — Hard delete card (distinct from archive)

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 3).

## What changed

A card can now be **permanently deleted** from the board, behind a confirmation dialog — a true
hard delete, kept visibly distinct from Archive.

- **Sync** (`packages/sync/src/board-doc.ts`): new `deleteCard(doc, cardId, now)`. In one
  transaction it strips `cardId` from every other card's `related` set (so no dangling relation
  survives — mirrors `deleteLabel`'s cross-card cleanup), then removes the card's own map key
  (`boardCards(doc).delete(cardId)`). No-op if the id is unknown. `archiveCard` is unchanged.
- **Commands** (`packages/commands/src/commands/card.ts`, `catalog.ts`): `deleteCard`
  (`{ cardId }` → `{ id, deleted: true }`), registered in the catalog (agent-reachable, R13).
- **Web hook** (`apps/web/lib/use-board.ts`): `useCardActions().delete`.
- **Drawer UI** (`apps/web/components/card/card-detail.tsx`): the footer now has two actions —
  **Archive** (neutral ghost; keeps the card) and **Delete** (danger ghost). Delete opens a
  confirmation `Dialog` ("Delete this card? … can't be undone. To keep it for later, archive it
  instead.") with Cancel / **Delete card** (danger). Confirming deletes the card and closes the
  drawer.

## Why

- The user defined delete as "no longer in the database" and archive as "still in the database"
  (they will build an Archive browsing view later). So delete is a genuine hard delete, and
  archive keeps its current keep-in-doc behavior untouched.
- A **confirm dialog** (not an undo toast) matches that decision — there is no toast/undo
  primitive in the app, and a hard delete warrants explicit confirmation.
- Archive was recolored from danger to neutral now that Delete is the destructive action, so the
  two read correctly: archive = reversible/keep, delete = destroy.
- Inbound-relation cleanup is done in the same transaction so a deleted card never leaves a
  dangling id in another card's Related list (depends on UNIT-9.1).

## How it works

`deleteCard` iterates all cards once to remove the target id from any `related` set, then deletes
the card key. Yjs treats the map-key delete as a normal mergeable op; concurrent nested edits to a
deleted card are dropped on merge (acceptable for a single-user board). Selectors
(`cardsInStatus`, `allLiveCards`, `getCard`) return nothing for a deleted id because the key is
gone. Orphaned activity-log entries for the deleted card remain (harmless; deferred).

## How to test / verify

- **Unit tests (all green):**
  - `packages/sync/src/board-doc.test.ts` (`hard delete`): removed from selectors + doc; strips
    the id from other cards' relations; unknown-id no-op; and the archive-vs-delete contrast
    (archive keeps the map key, delete removes it).
  - `packages/commands/src/commands/card.test.ts`: `deleteCard` returns `{ id, deleted: true }`
    and the card is no longer fetchable.
  - `packages/commands/src/catalog.test.ts`: `deleteCard` registered alongside `archiveCard`.
  - `apps/web/components/card/card-detail.test.tsx`: cancelling the dialog does not delete;
    confirming hard-deletes and calls `onClose`; archiving keeps the card (archived).
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e`
  `focus-mode.spec.ts` DOM-lib break, unrelated); lint clean; `vitest run` = 411 passed / 37
  skipped; `@boardly/web build` compiles.

## Follow-ups / known gaps

- **Dark-mode screenshot pending:** no web dev server was running this session (only the Docker
  prod stack), so the automated dark-mode capture of the footer (Archive + Delete) and the confirm
  dialog was not run. The Delete confirm uses the existing `danger` Button variant and the shared
  `Dialog` primitives (both DESIGN.md-approved); behavior is covered by component tests. Capture
  the dark-mode shot when the dev stack is up.
- Orphaned activity-log entries for hard-deleted cards are left in place (cosmetic; deferred per
  the plan).
