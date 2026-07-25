# UNIT-14.2 — `unarchiveCard` command (restore parity for agents)

Part of the Archive view batch (`docs/plans/2026-07-24-001-feat-archived-cards-view-plan.md`, Unit 2).

## What changed

Restore is now a first-class command in the catalog, so the agent surface (REST + MCP, generated
from the catalog) gains archive/restore parity with the UI — any action a user can take, an agent
can take (R13).

- **Command** (`packages/commands/src/commands/card.ts`): new `unarchiveCard` command —
  `input: { cardId }`, calls `syncUnarchiveCard(doc, cardId, now, userId ?? clientId)`, returns
  `{ id, archived: false }`. Exact inverse of the existing `archiveCard` command.
- **Catalog** (`packages/commands/src/catalog.ts`): `unarchiveCard` imported and registered next to
  `archiveCard`. REST (Unit 3.9) and MCP (Unit 3.10) enumerate the catalog, so no extra wiring is
  needed for agents to reach it.

## Why

- The UI restore action (UNIT-14.3/14.4) must route through the command layer like every other
  mutation — components never call sync mutators directly (agent-native parity, plan R13). Adding the
  command also makes restore scriptable/automatable for free.
- Delete-permanently reuses the existing `deleteCard` command; only restore was missing.

## How it works

`unarchiveCard` is a thin `defineCommand` wrapper: zod validates `{ cardId }` at the boundary
(rejecting `{}`), then it delegates to the sync `unarchiveCard` (UNIT-14.1) with the injected
`now()` and actor. Its result is JSON-serializable like every catalog command.

## How to test / verify

- **Unit tests (green):** `packages/commands/src/catalog.test.ts`
  - `unarchiveCard` is registered and appears in `listCommandNames()`.
  - `archiveCard` then `unarchiveCard` round-trips a card off the board (absent from `cardsInStatus`,
    present in `listArchivedCards`) and back (`{ id, archived: false }`, present in its column again).
  - `unarchiveCard` with missing `cardId` throws `ZodError` (rejected before mutating).
- **Run:** `pnpm --filter @boardly/commands test` → 38 passed.

## Follow-ups / known gaps

- Web hook (`useCardActions().unarchive`) and the Archive view UI land in UNIT-14.3 / UNIT-14.4.
