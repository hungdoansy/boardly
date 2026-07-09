# UNIT 1.1: `packages/sync` — Yjs schema & typed accessors

- **Plan unit:** 1.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R1 (offline-first), R5 (core board), R6 (card fields)
- **Commit(s):** _this unit's commit_

## What changed

The board & workspace `Y.Doc` schemas with typed create/read/update/soft-delete accessors and
fractional ordering wired in. No React/DOM/network here (that's 1.2 / Phase 3).

- `packages/sync/src/schema.ts` — top-level section accessors (`boardMeta`, `boardColumns`,
  `boardCards`, `boardLabels`, `workspaceBoards`), defensive scalar readers
  (`getString`/`getNumber`/`getBool`), and Y → plain-domain converters (`cardToPlain`,
  `columnToPlain`, `boardToPlain`, `boardRefToPlain`). `YCard`/`YColumn`/`YLabel` = `Y.Map<unknown>`.
- `packages/sync/src/board-doc.ts` — mutations, each a single `doc.transact`:
  `initBoard` (idempotent meta init), `renameBoard`, `addColumn`, `renameColumn`, `moveColumn`,
  `archiveColumn`, `addCard`, `setCardTitle`, `setCardPriority`, `setCardSeverity`, `moveCard`,
  `archiveCard`. Selectors: `liveColumns`, `cardsInColumn`, `reclaimCards`, `getCard`, `getBoard`.
- `packages/sync/src/workspace-doc.ts` — `addBoardRef`, `renameBoardRef`, `archiveBoardRef`,
  `listBoards`.
- `packages/sync/src/index.ts` — barrel.
- Tests: `board-doc.test.ts` (11), `workspace-doc.test.ts` (1). `package.json` gains `yjs 13.6.31`.

## Why (decisions)

- **Flat, id-keyed `Y.Map`s + `columnId` on the card** (High-Level Technical Design), never
  array-of-ids ordering — that rewrites the whole array on every move and clobbers/dupes under CRDT
  merge (the Focalboard lesson + Yjs move-duplication pitfall). Structured values (`dueDate`) are a
  nested `Y.Map`, sets (`labels`) a `Y.Map<id,true>`, and `description` a `Y.Text` — no JSON strings.
- **A move is a single `columnId` + `ord` write.** `moveCard` sets both in one transaction. This is
  why concurrent moves of the same card converge to exactly one column (Yjs LWW on the two scalar
  keys) with no duplicate — the card is a single map keyed by id.
- **Deleting a column does NOT reparent its cards.** `archiveColumn` soft-deletes the column only;
  cards keep their `columnId`. `reclaimCards` surfaces any non-archived card whose `columnId` is not
  a _live_ column into an "Unsorted" bucket — so an orphan created concurrently with a column delete
  is never lost or duplicated.
- **Soft-delete everywhere** (`archived` + `deletedAt`); hard GC is deferred. Archived items stay in
  the map (needed for undo + clean merge) but drop out of selectors.
- **`now` is injected** into every mutation (no `Date.now()` in the lib) so ordering/timestamps are
  deterministically testable.
- **Short-id assigned on create** (`meta.shortIdSeq++` inside the `addCard` transaction). The
  concurrent-collision **repair-on-read** is Unit 2.8; this unit only does the create-time
  assignment.
- **`status` is intentionally not on the card yet** — workflow status is Unit 2.12 (mirrors the
  domain `Card` type, which also omits it until then).

## How it works

Each accessor opens a `doc.transact` and mutates typed keys on the relevant sub-map. Ordering uses
`@boardly/domain`'s `keyBetween(afterOrd, beforeOrd, clientId)` (composite fractional key +
clientId tie-breaker); appends compute `keyBetween(maxOrd, null)`. Selectors read the maps, filter
archived, convert to plain domain objects, and sort with `byOrd`. Converters are defensive so a
partially-synced or malformed sub-map never throws.

## Design (UI units)

N/A — no UI. Selectors (`cardsInColumn`, `liveColumns`, `reclaimCards`) are shaped for the board
view (1.4/1.5) and the reclaim/"Unsorted" bucket.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"` then `pnpm --filter @boardly/sync test`
(12 tests):

- **Creation/selectors** — board meta init; cards grouped + `ord`-sorted per column; sequential
  short ids (`BRD-1`, `BRD-2`).
- **moveCard** — across columns (columnId + ord); reorder strictly between neighbors; repeated
  same-gap inserts stay ordered; start/end boundary ord.
- **Soft-delete** — archived card leaves selectors but stays in the map.
- **Field setters** — typed set + `updatedAt` bump.
- **Concurrency (merged docs)** — (1) two docs move the same card to different columns → after
  `applyUpdate` both, the card is in **exactly one** column and both replicas converge; (2) column
  archived in A while B adds a card to it → after merge the card is surfaced by `reclaimCards`
  exactly once, absent from every live column, and both replicas agree.

Full gates: `pnpm turbo run typecheck` (6/6), `lint` (6/6), `test` (domain 15 / sync 12 / ui 2),
`format:check` clean.

## Follow-ups / known gaps

- **Unit 1.2** adds `y-indexeddb` persistence + the `useY` React binding.
- **Unit 1.7** (command layer) will wrap these accessors; UI never calls them directly.
- Label/checklist/link **write** accessors are deferred to their feature units (2.2/2.5/2.7); the
  converters already read them so no schema change is needed then.
- Short-id **repair-on-read** for concurrent-create collisions: Unit 2.8. `status`: Unit 2.12.
- Fractional-key rebalance pass: deferred (plan Open Questions).
