# UNIT 2.11: Instant fuzzy search

- **Plan unit:** 2.11 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R8
- **Dependencies:** 2.9 (command palette) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Fast fuzzy search over every card across all boards, available both as a standalone palette
(sidebar **Search** / `/`) and as a mode inside the ⌘K command palette.

- `apps/web/components/search/search-index.ts` — new. Pure, dependency-free ranking: `SearchDoc`
  projection + `fuzzyScore` / `scoreDoc` / `searchDocs` / `recentDocs`.
- `apps/web/components/search/use-search.ts` — `useSearchDocs()`: a live, flattened index of every
  non-archived card across all boards, rebuilt when the board set changes or any board doc mutates.
- `apps/web/components/search/search.tsx` — `SearchDialog`, a cmdk palette with our own ranking
  (`shouldFilter={false}`): empty query → recents, query → ranked matches, select → deep-links.
- `apps/web/components/command-palette/palette.tsx` — "palette mode": when the ⌘K query is
  non-empty, a **Cards** group of matching cards is shown alongside the action commands.
- `apps/web/components/app/workspace-app.tsx` — the sidebar **Search** button (and the `/` key,
  ignored while typing) opens `SearchDialog`; the button's hint changed `⌘K` → `/`.
- `apps/web/lib/use-boards.ts` — hash routing extended to `#board/<boardId>/card/<cardId>`; added
  `useSelectedCard()` and `useOpenCardNav()` (open a card on any board in one hash write).
- `apps/web/components/board/board-view.tsx` — the detail sheet's open state now comes from the hash
  (`useSelectedCard`) instead of local state, so search/palette can deep-link a card on any board.
- `packages/sync` — `allLiveCards(doc)`: every non-archived card on a board (any column), short-id
  repaired. `packages/ui` `CommandDialog` gained optional `title` + `shouldFilter` props (defaults
  unchanged, so 2.9 is untouched).
- Tests: `apps/web/components/search/search.test.tsx`; `packages/sync/src/board-doc.test.ts`
  (`allLiveCards`).

## Why (decisions)

- **Ranking is a pure module.** `fuzzyScore` returns `null` for a non-match and a positive score
  otherwise: a contiguous substring scores far above a scattered subsequence, and prefix /
  word-boundary hits are boosted. `scoreDoc` takes the best **weighted** field score
  (shortId > title > labels > board > description), so "auth" ranks _Auth service_ (title prefix)
  above _Authenticate the user_ above a card that only mentions auth in its description. Keeping
  this DOM/Yjs-free makes the ranking deterministic and unit-testable.
- **Live index via one subscription per board doc.** `useSearchDocs` bumps a version on any board
  doc `update` and recomputes the flattened docs; the board set changing re-subscribes. This
  satisfies "search updates as underlying cards change" without per-card React subscriptions (which
  would violate the rules of hooks over a dynamic set).
- **Deep-link through the URL hash.** Opening a card is now `#board/<b>/card/<c>` — one hash write
  switches board _and_ opens the card, which is exactly what cross-board search needs (the target
  board's view mounts and reads the open card from the hash). It is also static-export friendly and
  makes a specific card shareable/bookmarkable. The board view's detail state moved from local
  `useState` to `useSelectedCard` as a result; focus-return on close (Unit 2.10) still works.
- **Own ranking in the standalone dialog, cmdk's filter in the palette.** The dialog sets
  `shouldFilter={false}` and feeds pre-ranked results (so recents/ordering are ours). The ⌘K palette
  keeps cmdk's built-in filtering and simply renders card items (gated to a non-empty query) whose
  `value` includes title/shortId/labels — good enough there and zero risk to the 2.9 command items.
- **`/` for search, ⌘K for the command palette.** Two distinct entry points (Linear-style); the
  sidebar hint now reads `/`. Both ignore keystrokes while typing in a field.

## Design (UI)

`SearchDialog` reuses the command-palette styling from `docs/design/DESIGN.md`: dimmed overlay,
centered popover on `bg-popover`, `text-fg-faint` group headings, `bg-overlay` selection. Each row
shows the card title, its board name, and its mono short id. Screenshot (dark, query "auth"):
`docs/units/screenshots/UNIT-2.11-search-dark.png`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web test` — `search.test.tsx`: **pure ranking** (empty query → none; title
  prefix ranked above scattered; description-only match ranked lowest; match by short id and by
  label; no-match → none; recents by `updatedAt`) and **dialog** (recents with an empty query;
  filter to a matching card and deep-link the hash on select; empty state on no match).
- `pnpm --filter @boardly/sync test` — `allLiveCards` returns non-archived cards across columns,
  excluding archived.
- Full gates: `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`
  (domain 26 / sync 20 / commands 7 / ui 2 / web 79), `pnpm --filter @boardly/web build`,
  `pnpm format:check` — all green.
- **Live (Playwright MCP, dark):** created a board + 4 cards; `/` opened Search showing recents;
  typing "auth" narrowed to _Design authentication flow_ (BRD-1); selecting it set the hash to
  `#board/<b>/card/<c>` and opened the card detail; in ⌘K, typing "login" surfaced a **Cards** group
  with _Fix login redirect bug_ (BRD-2).

## Follow-ups / known gaps

- **Cross-board deep-link timing** is handled by the hash + fresh board-view mount; if boards ever
  render lazily behind a spinner, revisit that the card opens once the board is ready.
- **Palette-mode ranking** uses cmdk's filter, not `scoreDoc`. If the two ever visibly disagree,
  switch the palette to `shouldFilter={false}` and rank commands + cards uniformly.
- **Archived cards** are excluded from search (matches board views). A "search archived" toggle is a
  later addition (candidate with 4.x filters).
- **Index cost** is O(all cards) per recompute; fine at local scale. Memoize per doc-version if a
  very large workspace makes it noticeable.
