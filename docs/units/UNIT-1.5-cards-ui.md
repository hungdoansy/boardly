# UNIT 1.5: Cards UI (create / edit title / archive) + card face

- **Plan unit:** 1.5 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R5 (core board), R6 (card fields)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-1.5-cards-dark.png`

## What changed

Cards render in their column with quick create, inline title edit, and archive.

- `apps/web/components/card/card.tsx` — `CardFace`: title (2-line clamp; inline edit on
  double-click), short id (mono, tertiary), hover archive button. The badge row (status/priority/
  labels/links) mounts here in Phase 2.
- `apps/web/components/card/card-composer.tsx` — `CardComposer`: quick-add at the column bottom
  (Enter creates and keeps the composer open for rapid entry; Esc/blur closes).
- `apps/web/components/board/column-cards.tsx` — `ColumnCards`: connects a column's cards + card
  actions and renders the card list + composer (one hook instance per column, so hooks obey the
  rules of hooks).
- `apps/web/components/board/board-view.tsx` — columns now render `<ColumnCards>`; the "Unsorted"
  bucket renders reclaimed cards as real `CardFace`s.
- `apps/web/lib/use-board.ts` — `useCardsInColumn` (live, ord-sorted via `useY` on the cards map,
  `deep`) and `useCardActions` (create/rename/archive — **all via the command layer**).
- Test: `apps/web/components/card/card.test.tsx`.

## Why (decisions)

- **`ColumnCards` connector component.** Each column needs its own `useCardsInColumn` subscription;
  calling a hook inside `columns.map` would violate the rules of hooks, so the per-column subscription
  lives in a child component.
- **`useY(boardCards, …, deep)` for a column's cards.** Add/archive mutate the top-level cards map;
  rename/edit mutate a nested card map — `deep` catches both, and scoping to the cards map keeps
  unrelated board changes from re-rendering the list.
- **All mutations through the command layer** (`createCard`/`renameCard`/`archiveCard`) — agent
  parity (R13). Empty titles are rejected in the composer _and_ by the command's zod schema.
- **Composer stays open on Enter** (Linear-style rapid entry); a blank/whitespace title is a no-op.
- **Reclaimed cards are first-class** — the "Unsorted" bucket renders `CardFace`s with working
  rename/archive, so orphaned cards remain fully manageable.

## Design (per DESIGN.md)

- Card faces: `--bg-elevated` + `--border-subtle`, `8–10px` padding, `text-base` title (2-line
  clamp), short id in `--font-mono` `text-xs` `--text-tertiary`. Hover raises to `--bg-overlay` +
  `--border-default`; the archive affordance fades in on hover (`opacity`/`--dur-fast`). Cards gap
  `6px`; column counts are live. All tokens, one accent.
- Dark screenshot: `docs/units/screenshots/UNIT-1.5-cards-dark.png` (To Do: 2 cards, Doing: 1,
  short ids BRD-1..3).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test`
(13 total; 5 new):

- Quick-add two cards → they append in order (asserted against the doc).
- Whitespace-only title is rejected (no card created).
- Inline title edit.
- Archive removes the card from the column.
- **Perf sanity:** 500 cards render (500 `article`s) without error.

Full gates: `pnpm turbo run typecheck` (7/7), `lint` (7/7), `test` (domain 15 / sync 16 / commands 4 /
ui 2 / web 13), `pnpm --filter @boardly/web build` (static export valid), `format:check` clean.
Dark Playwright add-card flow + screenshot reviewed vs DESIGN.md.

## Follow-ups / known gaps

- **Card badge row** (status/priority/severity/due/labels/links) is Phase 2 (2.3–2.7, 2.12); the face
  is laid out to accept it.
- **Card detail panel** (open, markdown description) is Unit 2.1; double-click currently edits the
  title inline only.
- **Drag-and-drop** (reorder / move across columns) is Unit 1.6; `moveCard` command already exists.
- **Virtualization** for very long lists is deferred (plan R2 note) — 500 cards render fine now;
  revisit if scroll/drag perf demands it.
