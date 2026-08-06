# UNIT 14: Column 3-dots menu — archive all cards in a column

- **Plan unit:** UNIT-14 (`docs/plans/2026-07-24-001-feat-column-archive-menu-plan.md`)
- **Status:** done
- **Requirements:** R1–R6 (see plan)
- **Commit(s):** _pending_

## What changed

A column header now has a 3-dots (`MoreHorizontal`) **actions menu**. Its one item, **Archive
all**, archives every card the column currently shows (filter-scoped) after a confirmation dialog.

- **New UI primitive** — `packages/ui/src/components/dropdown-menu.tsx`: a Radix
  `@radix-ui/react-dropdown-menu` wrapper, restyled to the exact same tokens as
  `context-menu.tsx` (a click-triggered menu; the app previously had only the right-click
  `ContextMenu`). Exported from `packages/ui/src/index.ts`. New pinned dep
  `@radix-ui/react-dropdown-menu@2.1.20` (kept in lockstep with `react-menu@2.1.20`, which
  `react-context-menu@2.3.3` already pulls in — so no duplicate transitive deps).
- **New bulk command** — `archiveCards({ cardIds })` in
  `packages/commands/src/commands/card.ts`, registered in `packages/commands/src/catalog.ts`.
  Archives each supplied **live** card (reusing `syncArchiveCard`), ignoring ids that don't exist
  or are already archived; returns `{ archivedIds, count }`. Exposed to the web app as
  `useCardActions().archiveMany(cardIds)` in `apps/web/lib/use-board.ts`.
- **New domain selector** — `visibleCardIdsByStatus(cards, filter, ctx)` in
  `packages/domain/src/filters.ts`: the per-status id lists a filtered board shows, mirroring
  `countByStatus` exactly.
- **New component** — `apps/web/components/board/column-menu.tsx` (`ColumnMenu`): the 3-dots
  trigger + dropdown + confirmation `Dialog`.
- **Wiring** — `BoardColumn` (`column.tsx`) gained a `menu?: ReactNode` header slot;
  `StatusColumn` (`dnd.tsx`) gained a `visibleCardIds` prop and renders `<ColumnMenu>` into that
  slot; `BoardView` (`board-view.tsx`) derives `visibleCardIdsByStatus` and threads it down.
- **Tests** — `packages/ui/src/components/dropdown-menu.test.tsx`, new `archiveCards` cases in
  `packages/commands/src/commands/card.test.ts` + a catalog registration check in
  `catalog.test.ts`, and a `column archive menu` block in
  `apps/web/components/board/column.test.tsx`.
- **Docs** — `docs/design/DESIGN.md` (column-header interaction + primitives table); this doc.

## Why (decisions)

- **A real `DropdownMenu` primitive, not `Popover`/`ContextMenu`.** A 3-dots affordance is a
  click-triggered menu button; the correct accessible pattern is a menu (`role="menu"`, roving
  focus), which Radix `dropdown-menu` provides. `ContextMenu` is right-click-only. DESIGN.md
  already named `dropdown-menu` as the intended base for card/column `⋯` menus.
- **Bulk archive takes explicit ids, not a status.** The chosen scope is "only the cards visible
  under the active filter." The UI knows those ids, so passing them explicitly makes the effect
  exact, keeps the confirmation count truthful, and gives agents a general "archive these cards"
  primitive.
- **Visible ids derived in `BoardView`, from the same filter path as the columns.**
  `visibleCardIdsByStatus` shares `evaluateFilter`/`isEmptyFilter` with `countByStatus`, so the
  archived set equals the header count by construction — no drift with what `ColumnCards` renders.
- **Menu omitted on empty columns.** With a single action and nothing to archive, `ColumnMenu`
  returns `null` when `visibleCardIds.length === 0`.
- **Confirmation, no undo; neutral primary button.** Bulk archive is higher-impact than the card's
  no-confirm single archive, so it gets the dialog guard. Archiving is non-destructive (unlike
  Delete), so the confirm button is the primary variant, not `danger`.

## How it works

`BoardView` computes `visibleIds = visibleCardIdsByStatus(allCards, filter, filterCtx)` alongside
the existing `counts`. Each `StatusColumn` receives `visibleCardIds={visibleIds[status] ?? []}`,
renders `<ColumnMenu status visibleCardIds/>`, and passes it into `BoardColumn`'s header `menu`
slot (beside the add-card "+"). `ColumnMenu` opens a `DropdownMenu`; selecting "Archive all" opens
a confirm `Dialog` naming the count + status; confirming calls
`useCardActions().archiveMany(visibleCardIds)` → `execute(archiveCards, …)` → `syncArchiveCard`
per id. Because archiving flips a per-card `archived` flag in the Yjs doc, the `useY`-bound counts,
columns, and empty-column visibility update reactively.

Stale-list safety: `archiveCards` re-reads each card and skips missing/already-archived ones, so a
card moved out of the column between menu-open and confirm simply isn't archived — no throw, no
partial corruption.

## Design (UI unit)

- Trigger: `size-6` ghost icon button (`MoreHorizontal`, `size-3.5`), `text-fg-faint` →
  `hover:bg-hover hover:text-fg`, accent focus ring, `data-[state=open]` keeps it lit — matches the
  header "+".
- Menu: identical tokens to `ContextMenu` (`bg-popover`, `border-line`, radius, accent left-rail on
  highlight); `dur-base` fade/zoom enter, respects `prefers-reduced-motion` via the shared classes.
- Confirm dialog: same shape as the card Delete confirm (`max-w-sm`, `DialogTitle` + muted body +
  ghost Cancel / primary confirm), neutral primary "Archive all" button with a leading `Archive`
  SVG. Icons are lucide SVGs, no glyphs (DESIGN.md §7.1).
- Dark-mode: verify the header 3-dots + open menu + confirm dialog on a populated column.

## How to test / verify

- `packages/ui` — `dropdown-menu.test.tsx`: closed initially; opens (keyboard) to a `role="menu"`
  with items; item `onSelect` fires and closes; Escape closes.
- `packages/commands` — `card.test.ts`: archives supplied live cards + reports them; empty list is
  a no-op; unknown/already-archived ids ignored. `catalog.test.ts`: `archiveCards` registered.
- `apps/web` — `column.test.tsx` (`column archive menu`): 3-dots → "Archive all" → confirm archives
  every visible card (column empties); empty column shows no menu; Cancel archives nothing.
- Run: `pnpm --filter @boardly/ui --filter @boardly/commands --filter @boardly/domain test`,
  `pnpm --filter web test`, plus `typecheck`/`lint`/`build` green.
- Manual (dark): open the board, hit the column 3-dots, Archive all, confirm; the column empties.
  With an active filter, the confirm count equals the header count and filtered-out cards remain.

## Follow-ups / known gaps

- No **Archive view** yet to browse/restore archived cards — bulk archive is not yet reversible in
  the UI (pre-existing gap; the confirmation wording avoids promising restore).
- No undo toast; the confirmation dialog is the only guard.
- The 3-dots menu is on the standard board columns only, not the grouped **swimlane** view (which
  doesn't render `StatusColumn`).
- `ColumnMenu` holds a single action; the primitive/structure is ready for future items
  (e.g. Mark all done) without rework. **Done in UNIT-19**, which added "Mark all done" beside
  "Archive all" — as predicted, with no rework to this unit's primitive or plumbing.
- **Fixed in UNIT-19:** this dialog's body rendered as "This removes **themfrom** the board" — a JSX
  text run that wraps onto a second source line drops the space that preceded it, and Prettier
  removes the `{" "}` that would restore it. The copy is now built by an `archiveBody(count)` string
  helper in `column-menu.tsx`; see UNIT-19's _Why_ for the full explanation.
