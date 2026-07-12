# UNIT-7.7 — Domain + sync: eight statuses, collapse `columnId` into `status`, `showEmptyColumns` meta

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 7). Satisfies R9, R11.

This is a **data-model change, not behavior-preserving** — it is covered by the plan's "reset, not migrate" posture (Scope Boundaries). Existing per-column card placement is abandoned; a card's placement is now its `status` (defaulting to Todo where absent).

## What changed

`status` becomes the **single placement axis**. The `Column` entity and the card's `columnId` are deleted, the status enum grows to eight fixed values, and a synced `showEmptyColumns` board-meta flag is added.

- **`packages/domain/src/status.ts`** — `STATUS_VALUES` now has eight values: `backlog, todo, in_progress, pending, in_review, done, canceled, duplicate`. `STATUS_ORDER` is exactly **Backlog, Todo, In Progress, Pending, In Review, Done, Canceled, Duplicate** (the fixed board columns, left→right). `STATUS_META` covers all eight:
  - `pending` → name "Pending", category `started`, color `#e2b341` (amber, distinct from In Progress's `#f2c94c`).
  - `duplicate` → name "Duplicate", category `canceled`, color `#565b66` (muted gray, in the same family as Canceled's `#6b7080`).
  - `DEFAULT_STATUS` stays Todo. `isCanceledStatus`/`isTerminalStatus` now also cover `duplicate` (via its `canceled` category).
- **`packages/domain/src/types.ts`** — deleted the `Column` interface (`id/title/ord/wipLimit/archived/deletedAt`); removed `columnId` from `Card` (with a comment that `status` is the placement axis, ordered within a group by `ord`). Added `showEmptyColumns: boolean` to `Board`.
- **`packages/domain/src/io/snapshot.ts`** — removed `columnSchema`/`SnapshotColumn`, the `columns` array from `boardSnapshotSchema`, and `columnId` from `cardSchema`. A snapshot is now labels + cards (placement via `status`).
- **`packages/domain/src/io/markdown.ts`** — export now emits one `## <Status name>` section per **non-empty** status (in `STATUS_ORDER`) instead of per column.
- **`packages/domain/src/io/obsidian.ts`** — import maps each `## heading` to a status: a heading whose name matches a `STATUS_META` name (case-insensitive) adopts that status, otherwise cards under it default to Todo; a checked box (`- [x]`) still overrides to Done. No `columns` array is produced; the "no sections" guard replaces the "no columns" guard.
- **`packages/sync/src/schema.ts`** — dropped `YColumn`, the `boardColumns` accessor, and `columnToPlain`; removed `columnId` from `cardToPlain`; `boardToPlain` now reads `showEmptyColumns` from meta, **defaulting to `true` when absent**.
- **`packages/sync/src/board-doc.ts`**:
  - Removed `addColumn`/`renameColumn`/`setColumnWipLimit`/`moveColumn`/`archiveColumn`, `liveColumns`, `reclaimCards`, the `ordOfColumn` helper, and the `AddColumnParams` type.
  - Replaced `cardsInColumn(columnId)` with **`cardsInStatus(status)`** — non-archived cards with that `status`, sorted by `ord`.
  - `addCard` now takes an optional `status` (default Todo) instead of `columnId`, and computes its `ord` at the end of the target status group.
  - **`moveCard(doc, cardId, toStatus, neighbors, clientId, now, actor?)`** writes `status` + a between-neighbors `ord` in one transaction. It logs a **`status`** activity entry only when the status actually changes; moving within the same status is a pure reorder and logs nothing.
  - Added **`setShowEmptyColumns(doc, show, now)`** (mirrors `setBadgeConfig`/`setTicketPrefix`: sets the meta key and bumps `updatedAt`).
  - `boardToSnapshot`/`buildBoardFromSnapshot`/`buildCard` emit/consume no columns array and no `columnId`.
  - `setCardStatus` (drawer picker) is unchanged in behavior (LWW status without reordering); only its doc comment was clarified.

## Why

- **Collapse `columnId` into `status` (R9).** Today's two independent axes (`columnId` for placement, `status` for workflow) have no product value — a card could sit in the "Doing" column with `status: todo`. Linear's board columns *are* statuses. Collapsing removes an entire axis of confusion and makes drag-to-column mean what users expect. `status` already exists on every card, so the reset is cheap.
- **Eight fixed statuses (R9).** The board renders exactly `STATUS_ORDER` — no add/rename/reorder/WIP. Because the command and UI status enums derive from `STATUS_VALUES`, the set can't drift. Pending→`started` and Duplicate→`canceled` are the plan's resolved category defaults; colors were picked from the `DESIGN.md` status/label palette (amber for Pending, a muted gray for Duplicate).
- **`showEmptyColumns` as board meta (R11).** A per-user, synced boolean (default `true`) so the show/hide-empty preference is durable and device-independent, following the existing badge/prefix meta pattern.
- **`moveCard` logs `status`, not `moved`.** Since a card's column *is* its status, a drag to another column *is* a status change; logging a `status` entry keeps the card timeline consistent with the drawer picker. The `MovedActivity` union member in `activity.ts` is left in place (harmless, still readable) but is no longer produced.

## How it works

The Yjs doc no longer has a `columns` map. A card carries `status` (a `STATUS_VALUES` string) and a fractional `ord`. Board rendering derives its columns from `STATUS_ORDER` and resolves each column's cards via `cardsInStatus(status)`. Drag calls `moveCard(toStatus, neighbors)` (status + position in one op); the drawer picker calls `setCardStatus(status)` (status only, keeps `ord`). Concurrent moves of the same card converge by Yjs LWW to exactly one status — never duplicated. `showEmptyColumns` lives on the meta map and reads back `true` when never written.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

```
pnpm --filter @boardly/domain run typecheck   # green
pnpm --filter @boardly/domain run test        # 7 files, 90 tests pass
pnpm --filter @boardly/domain run lint         # clean
pnpm --filter @boardly/sync run typecheck      # green
pnpm --filter @boardly/sync run test           # 7 files, 46 tests pass
pnpm --filter @boardly/sync run lint           # clean
```

Key scenarios asserted by the tests:

- `packages/domain/src/status.test.ts` — `STATUS_VALUES` has 8 values (incl. `pending`, `duplicate`); `STATUS_ORDER` is exactly Backlog…Duplicate; every value has name/category/color; Pending→`started`, Duplicate→`canceled`; `isTerminalStatus(Duplicate)` is true.
- `packages/sync/src/board-doc.test.ts` — `cardsInStatus` groups/sorts by status; `moveCard` to a new status sets `status` + a between-neighbors `ord` and logs one `status` activity; a same-status move only reorders with no activity; `getBoard().showEmptyColumns` defaults `true` and round-trips a `false` write; concurrent moves to different statuses converge to one.
- `packages/sync/src/io.test.ts` — snapshot round-trip carries cards by status (no columns array); an Obsidian import places cards by heading→status.
- `packages/domain/src/io/io.test.ts` — JSON round-trip / Markdown-by-status / Obsidian heading→status mapping.

Grep proof (no `Column` type, `columnId`, `wipLimit`, or column op remains in domain+sync source — only doc comments mention the word "column"):

```
grep -rniE "columnId|wipLimit|\bColumn\b|liveColumns|cardsInColumn|reclaimCards|addColumn|boardColumns" \
  packages/domain/src packages/sync/src --include="*.ts" | grep -v "\.test\.ts"
```

## Follow-ups / known gaps (deliberate downstream red)

- **`@boardly/commands` and `@boardly/web` do not compile after this unit** — by design. They still reference the removed column ops and the old `moveCard(toColumnId)` signature. **Unit 8** aligns the command layer (delete column commands, repurpose `moveCard` to `toStatus`, add a `setShowEmptyColumns` command) and **Unit 9** aligns the web board (render fixed status columns, drag-sets-status, empty-columns toolbar toggle, remove the interim default-column seed). Only `@boardly/domain` and `@boardly/sync` are required green here.
- `activity.ts`'s `MovedActivity` type is retained for backward-compatible reading of any historical `moved` entries, but is no longer written; it can be pruned in a later cleanup.
- The snapshot `board` object does not carry `showEmptyColumns` (it is a device/board preference, not exported content); import/export is unaffected.
