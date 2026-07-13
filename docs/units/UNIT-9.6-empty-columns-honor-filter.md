# UNIT-9.6 — Empty-column hiding honors the active filter

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 8).

## What changed

With "hide empty columns" on, a status column whose cards are all removed by the active filter now
hides too (previously it stayed on screen, rendering empty). Column header counts also reflect the
filtered set.

- **Domain** (`packages/domain/src/filters.ts`): new pure `countByStatus(cards, filter, ctx)` →
  `Record<Status, number>` with every status present (0 when none). Absent/empty filter counts all.
- **Board** (`apps/web/components/board/board-view.tsx`): replaced the unfiltered `useCardCounts`
  with `countByStatus(useAllCards(), filter, filterCtx)` (memoized). The same counts drive both the
  hide-empty `visibleStatuses` filter and each `StatusColumn`'s header `count`. `filterCtx` was
  moved above the counts so the memo can use it.

## Why

- The old `useCardCounts` counted raw (unfiltered) cards, so a filter that emptied a column left an
  empty column visible — inconsistent with what the column actually rendered (`ColumnCards` filters
  its cards). Deriving one set of counts from the filtered cards makes visibility and header counts
  agree with the rendered content.
- Extracting `countByStatus` as a **pure** function keeps the logic unit-testable without mounting
  the DnD board (the repo's pattern — cf. `moveFocus`, the other pure `filters.ts` helpers) and
  makes it reusable. When no filter is active it equals the previous unfiltered counts, so
  unfiltered behavior is unchanged.

## How it works

`board-view` subscribes to all live cards (`useAllCards`, deep) and computes per-status counts
under the active filter each render (memoized on cards/filter/ctx). `visibleStatuses` is
`showEmptyColumns ? STATUS_ORDER : STATUS_ORDER.filter((s) => counts[s] > 0)`. The hide-empty toggle
still governs visibility; the filter only governs the counts — so "hide-empty off + filter active"
shows all columns, and "hide-empty on + filter active" hides the non-matching ones.

## How to test / verify

- **Unit tests (all green), `packages/domain/src/filters.test.ts` (`countByStatus`):**
  - Counts all per status when there is no filter; every status present (0 when none).
  - Counts only cards matching the active filter (e.g. `priority is Urgent` → only urgent cards
    per status).
  - Filter matching nothing → every status is 0 (all columns would hide when hide-empty is on).
  - Empty filter is treated as no filter (counts all).
- These counts fully determine `visibleStatuses` (a trivial `> 0` filter over them) and the header
  counts. Rendering the full DnD `BoardView` in jsdom is intentionally not exercised — no test in
  the repo mounts the DnD board; pure-logic extraction is the established pattern.
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e` DOM-lib
  break, unrelated); lint clean (exit 0); `vitest run` = 435 passed / 37 skipped; `@boardly/web`
  build compiles.

## Follow-ups / known gaps

- **Dark-mode screenshot pending:** no web dev server this session, so the visual (columns
  disappearing as a filter empties them) was not captured. No styling changed — only which columns
  render — so the visual risk is low. Capture when the dev stack is up: apply a filter that empties
  a column with hide-empty on and confirm it disappears.
- The hide-empty toggle exists only on the board (not swimlanes/list), which group/filter cards
  differently and already omit empty lanes — no change needed there.
