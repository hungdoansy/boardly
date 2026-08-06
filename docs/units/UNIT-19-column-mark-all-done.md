# UNIT 19: Column 3-dots menu — mark all visible cards done

- **Plan unit:** UNIT-19 (interactive request; no dedicated plan file)
- **Status:** done
- **Commit(s):** _this commit_

## What changed

The column header's 3-dots menu gained a second bulk action, **Mark all done**, above the existing
**Archive all**. It sets every card the column currently shows to `Status.Done` — filter-scoped,
exactly like Archive all — after a confirmation dialog.

- **New bulk command** — `setCardsStatus({ cardIds, status })` in
  `packages/commands/src/commands/status.ts`, registered in `packages/commands/src/catalog.ts`
  (so REST + MCP pick it up automatically). Sets each supplied card's status, skipping ids that
  don't exist and cards already at that status; returns `{ updatedIds, count }`.
- **New web action** — `useCardActions().setStatusMany(cardIds, status)` in
  `apps/web/lib/use-board.ts`, the sibling of `archiveMany`.
- **`apps/web/components/board/column-menu.tsx`** — the "Mark all done" item (done `StatusIcon`,
  tinted with the Done accent) plus its confirmation dialog. The single `confirmOpen` boolean became
  a `pending: "done" | "archive" | null` state so at most one dialog can ever be open.
- **Bug fix, same file** — both confirmation bodies moved from JSX prose to `doneBody(count)` /
  `archiveBody(count)` string builders. The shipped Archive-all copy rendered as "This removes
  **themfrom** the board" (see _Why_ below); this fixes that alongside the new dialog.
- **Tests** — `setCardsStatus` cases in `packages/commands/src/commands/status.test.ts`, a catalog
  registration check in `catalog.test.ts`, a `column mark-all-done menu` block in
  `apps/web/components/board/column.test.tsx` (including a filter-scoped case), and an e2e test in
  `apps/e2e/tests/board.spec.ts`. The jsdom file's per-column menu opener was hoisted to a shared
  `openColumnMenu(status)` helper, and `setup()` now takes an optional `filter` so a test can render
  the board under an active filter.
- **Docs** — `docs/design/DESIGN.md` (column-header menu items); `docs/units/README.md`;
  `docs/units/UNIT-14-column-archive-menu.md` (copy fix noted in its Follow-ups); this doc.

No new dependencies, no new UI primitives — this reuses the `DropdownMenu` + confirm `Dialog` shape
UNIT-14 introduced.

## Why (decisions)

- **A general `setCardsStatus`, not a `markCardsDone`.** The bulk primitive mirrors the single
  `setCardStatus` (and `archiveCards`), so agents get "set these cards to this status" rather than a
  UI-shaped one-off. "Mark all done" is then just the UI passing `Status.Done`.
- **`updatedIds` reports only cards that actually moved.** `syncSetCardStatus` no-ops when the
  status is unchanged (and appends no activity entry), so counting every supplied id would overstate
  the effect and disagree with the activity log.
- **Ids are passed explicitly, not "everything in status X".** Same reasoning as UNIT-14: the chosen
  scope is _the cards visible under the active filter_, which only the UI knows. The board already
  derives that list once (`visibleCardIdsByStatus`) and threads it to `ColumnMenu`, so the new action
  needed **no** new plumbing and is filter-scoped by construction.
- **Missing/stale ids are skipped, not thrown on.** A card that moved between menu-open and confirm
  is simply left alone — same tolerance `archiveCards` has.
- **Hidden on the Done column only.** There, the action is a guaranteed no-op. Canceled and Duplicate
  keep it: reviving a dropped card as done is a real, if rarer, intent.
- **Confirmed, like Archive all.** Bulk status changes touch many cards at once and there is no undo;
  the dialog is the guard. The confirm button is the neutral primary variant (not `danger`) — nothing
  is destroyed.
- **One `pending` state instead of two booleans.** Makes "at most one dialog open" true by
  construction rather than by convention.
- **Dialog body copy is built as a string, not written as JSX prose.** Discovered while verifying
  in the browser: a JSX text run that wraps onto a second source line loses the space that preceded
  it, so `This removes {count === 1 ? "it" : "them"} from the board. <wrap>` renders as
  "removes **themfrom** the board" — and Prettier deletes the `{" "}` that would fix it, because
  Babel's whitespace rules (which Prettier models) say the space survives while the app's compiler
  drops it. A template literal in a single expression container keeps the compiler out of the copy
  and is stable under `prettier --write`. **This bug shipped in UNIT-14's Archive-all dialog**; it
  is fixed here. Any future confirm-dialog prose with an interpolation should follow the same shape.

## How it works

`BoardView` already computes `visibleIds = visibleCardIdsByStatus(allCards, filter, filterCtx)` —
the same filter path as the header counts — and passes `visibleCardIds` into each `StatusColumn` →
`ColumnMenu`. Selecting **Mark all done** sets `pending = "done"`, which opens a confirm dialog
naming the visible count and the column. Confirming calls
`useCardActions().setStatusMany(visibleCardIds, Status.Done)` →
`execute(setCardsStatus, …)` → `setCardStatus` (sync) per changed id, inside the command layer.

Because a card's column **is** its status, the cards visibly move to the Done column; the `useY`
bindings re-render the affected columns, counts, and (when "show empty" is off) column visibility.
Each changed card also gets a `status` activity entry, exactly as a one-card status change would.

Cards filtered out of the view are never in `visibleCardIds`, so they are never touched — the
confirmation count is the honest count.

## Design (UI unit)

- Menu item: `Mark all done`, first item in the menu (the most common triage action, matching the
  card context menu where "Mark done" sits near the top). Leading glyph is the shared `StatusIcon`
  for `done` in `STATUS_META[Status.Done].color` — identical to the card context menu's "Mark done",
  and an SVG, not a glyph (DESIGN.md §7.1).
- Menu order: `Mark all done` → `Archive all` → separator → `Hide` (mutating actions grouped, the
  view-only action separated). Both bulk items are omitted when the column shows no cards.
- Confirm dialog: same shape as the Archive all confirm (`max-w-sm`, `DialogTitle` + muted body +
  ghost Cancel / primary confirm). Confirm button carries a lucide `Check` — `currentColor`, so it
  stays legible on the accent-filled primary button (the Done `StatusIcon`'s accent fill would not).
- Body copy calls out the filter scoping ("Cards hidden by the current filter aren't touched"), so
  the guarantee is stated where the decision is made.
- Tokens/motion are inherited from the existing `DropdownMenu`/`Dialog` primitives — nothing new.
- Dark-mode screenshots (captured from the running app against the demo board):
  `docs/units/screenshots/UNIT-19-column-mark-all-done-dark.png` (open menu) and
  `UNIT-19-mark-all-done-confirm-dark.png` (confirm dialog).

## How to test / verify

- `packages/commands` — `status.test.ts` (`setCardsStatus`): moves the supplied cards and leaves
  untargeted ones alone; ignores unknown ids and cards already at the status (truthful `count`);
  empty list is a no-op; an out-of-enum status throws `ZodError` before mutating. `catalog.test.ts`:
  `setCardsStatus` registered and listed.
- `apps/web` — `column.test.tsx` (`column mark-all-done menu`): menu → confirm moves every visible
  card to Done; **under an active filter only the visible cards move and the confirm count is the
  visible count**; the item is absent on the Done column and on empty columns; Cancel changes nothing.
- `apps/e2e` — `board.spec.ts` ("marks a column's visible cards done from its 3-dots menu"): the
  full browser round-trip — two Todo cards land in Done, a Backlog card is untouched, and the Done
  column then offers Archive all but no Mark all done.
- Run: `pnpm --filter @boardly/commands test`, `pnpm --filter web test`, plus
  `pnpm typecheck` / `pnpm lint` / `pnpm build`. For e2e against an already-running dev stack, use a
  scratch config with no `webServer` and `baseURL: http://localhost:3000` — the committed config
  starts its own servers on the same ports. Note the dev API keeps the production 5/min login limit,
  so a batch of specs will fail at `signUp`; the committed e2e config raises it via `LOGIN_RATE_MAX`.
- Manual (dark): open the board, hit a populated column's 3-dots → **Mark all done** → confirm; the
  column empties into Done. With a filter active, filtered-out cards stay put and the dialog's count
  matches the header count.

## Follow-ups / known gaps

- **No undo.** The confirmation dialog is the only guard; reverting means re-setting each card's
  status by hand. An undo toast (and a general undo stack) remains unbuilt.
- **"Done" is fixed.** The menu offers only Done, not an arbitrary target status — `setCardsStatus`
  supports any of the eight, so a "Move all to…" submenu is a small addition if wanted.
- Like the rest of the column menu, this is board-columns only — the grouped **swimlane** view
  doesn't render `StatusColumn` and so has no 3-dots menu.
