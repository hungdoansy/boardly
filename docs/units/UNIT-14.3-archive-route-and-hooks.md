# UNIT-14.3 — `#archive` route + web hooks (`useArchiveRoute`, `useArchivedCards`, restore action)

Part of the Archive view batch (`docs/plans/2026-07-24-001-feat-archived-cards-view-plan.md`, Unit 3).

## What changed

The client-side plumbing the Archive view needs: a real route, a reactive archived-cards selector,
and a restore action — all mirroring the archived-projects equivalents.

- **Route** (`apps/web/lib/route.ts`): `Route` gains an `archive: boolean`. `parseRoute` returns it
  `true` only for the reserved single token `#archive` (early-return like `#settings`), `false`
  everywhere else. `settings` and `archive` are mutually exclusive by construction.
- **Route hook** (`apps/web/lib/use-boards.ts`): `useArchiveRoute()` — `[open, setOpen]` bridged to
  the hash, an exact copy of `useSettingsRoute()`'s shape. Opening it (`#archive`) clears any open
  card, since it's a distinct global route.
- **Selector hook** (`apps/web/lib/use-board.ts`): `useArchivedCards()` — a scoped, deep `useY`
  subscription returning `listArchivedCards(doc)` (mirrors `useAllCards`).
- **Card action** (`apps/web/lib/use-board.ts`): `CardActions.unarchive(cardId)` routes through the
  `unarchiveCard` command (`execute`), alongside the existing `archive`/`delete`.

## Why

- Making Archive a hash route (not local component state) keeps it a real, linkable, keyboard- and
  back-button-reachable destination — consistent with how Settings and project scopes already work,
  and required for the sidebar toggle + ESC ladder (UNIT-14.4).
- `useArchivedCards` is deep-subscribed so archiving/restoring elsewhere updates the view live, and
  scoped so unrelated board edits don't re-render it (CLAUDE.md §3).
- All mutation goes through the command layer (never sync mutators from components), preserving
  agent-native parity.

## How it works

`parseRoute` handles `archive` with the same reserved-token early-return as `settings`, so a real
ticket ref (e.g. `#archive-1-x`, a `PREFIX-N-slug`) is never mistaken for the route.
`useArchiveRoute`/`useSettingsRoute` both read from the single `subscribeRoute` notifier, so
in-app navigation updates them synchronously in one tick.

## How to test / verify

- **Route** (`apps/web/lib/route.test.ts`): `#archive` → `{ archive: true, settings: false, … }`;
  every other route has `archive: false`; `settings && archive` is never both-true; `#archive-1-x`
  is a ticket, not the archive route. All existing route expectations updated for the new field.
- **Hooks** (`apps/web/lib/use-boards.test.tsx`): `useArchiveRoute` is false initially, writes
  `#archive` on open and clears it on close (with hashchange); `useArchivedCards` reflects a card
  archived (appears) then restored via `actions.unarchive` (disappears).
- **Run:** `pnpm --filter @boardly/web exec vitest run lib/route.test.ts lib/use-boards.test.tsx` →
  green. Full workspace typecheck/lint green.

## Follow-ups / known gaps

- The Archive view itself, sidebar item, ESC ladder, and the card-detail Restore footer land in
  UNIT-14.4.
- A shareable `#PREFIX-N` deep-link that opens an _archived_ card is deferred (the ticket-hash
  resolver is live-cards-only); the Archive view opens cards via local drawer state instead.
