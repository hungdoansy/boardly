# UNIT-18 — Hide and restore board columns

Plan: `docs/plans/2026-08-05-001-feat-hide-show-columns-plan.md`

The board's eight fixed status columns can now be hidden individually and brought back. `Hide` lives
in each column header's 3-dots menu; a new **Columns** dropdown in the board toolbar lists every
status with a live count and a checkbox, and is the restore path.

---

## What changed

| File                                           | Change                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/components/dropdown-menu.tsx` | New `DropdownMenuCheckboxItem` (wraps Radix `CheckboxItem`), mirroring `DropdownMenuRadioItem`                                |
| `packages/ui/src/index.ts`                     | Exports it                                                                                                                    |
| `apps/web/lib/hidden-columns.ts`               | **New.** Device-local store of hidden statuses                                                                                |
| `apps/web/components/board/columns-menu.tsx`   | **New.** The toolbar `Columns` dropdown                                                                                       |
| `apps/web/components/board/board-view.tsx`     | `visibleStatuses` now composes both visibility rules; toolbar renders `ColumnsMenu`; all-hidden empty state                   |
| `apps/web/components/board/column-menu.tsx`    | Adds `Hide`; always renders (was `null` on empty columns); per-column trigger label                                           |
| `apps/e2e/tests/board.spec.ts`                 | Rewrote the hide-empty test against the new menu; added hide/persist/restore/list-view coverage and a dark-mode menu baseline |
| `docs/design/DESIGN.md`                        | §7 checkbox-item row; §2 column-header description updated                                                                    |

Public surface added — all in `apps/web/lib/hidden-columns.ts`:

```
HIDDEN_COLUMNS_STORAGE_KEY   "boardly-hidden-columns"
parseHiddenStatuses(raw)     pure; string | null -> Status[]
getHiddenStatuses()          current, STATUS_ORDER-sorted, stable reference
setColumnHidden(status, on)
showAllColumns()
subscribeHiddenColumns(fn)
useHiddenStatuses()          React hook
```

No Yjs field, no command, no REST/MCP entry — see the decisions below.

---

## Why

### Device-local, not synced board meta

Every board preference so far (`showEmptyColumns`, `zoom`, `badgeConfig`) lives in synced Yjs board
meta behind a command. This one deliberately does not: **how many columns fit is a property of the
screen, not the account**, so a laptop and a desktop should be able to differ. It is stored in
`localStorage` and read through a `useSyncExternalStore` module store, the same pattern as
`lib/theme.ts` and `lib/focus-mode.ts`.

**The cost, stated plainly:** this is a gap in agent-native parity (`PLAN.md` R13). There is no
command, so there is no REST or MCP surface, so an agent cannot hide or show a column even though a
user can. This was chosen knowingly, not overlooked. `CLAUDE.md` §3's "all mutations go through the
command layer" is not violated — that rule governs _Yjs_ mutations, and nothing here touches Yjs.

If this turns out to be the wrong call, migration is additive: add the board-meta field and command,
and seed it from the stored local value.

### Hiding beats `showEmptyColumns`

Two independent rules now narrow `STATUS_ORDER`, composed as a conjunction:

```
render(status)  ⟺  !hidden(status) ∧ (showEmptyColumns ∨ count[status] > 0)
```

Explicit hiding is the stronger one. Turning `showEmptyColumns` back on does **not** resurrect a
column the user deliberately hid, and neither does a card landing in it. The rejected alternative —
having `Hide` implicitly switch `showEmptyColumns` off — would have coupled two preferences that
users set for different reasons.

### One toolbar menu, not two controls

The board toolbar held exactly one control, the `Hide empty columns` / `Show empty columns` button.
Adding a second, parallel control for the closely-related "which columns show" question would have
made the toolbar incoherent, so the button was **removed** and its toggle moved inside the new
`Columns` menu as a checkbox row. One control now answers the whole question.

### A card can land in a hidden column, and that is fine

A card's status can change from the card detail drawer, the command palette, or an agent — including
into a hidden column. It stays hidden. Auto-unhiding was rejected: it would let a background action
silently undo a deliberate layout choice. Instead the cards are made _discoverable_: every row in the
`Columns` menu carries its live count, and the trigger reads `Columns · N hidden`. The cards are also
untouched everywhere else — list view, search, and filters do not know hiding exists.

### `Hide` has no confirmation

`Archive all` confirms because it mutates card data. `Hide` touches no data and the toolbar undoes it
in one click, so a dialog would imply a weight it does not have.

---

## How it works

```
STATUS_ORDER ─┬─> countByStatus(allCards, filter, filterCtx) ──> counts[status]
              ├─> useHiddenStatuses()   (localStorage, device-local)
              └─> useShowEmptyColumns() (Yjs board meta, synced)
                        │
                        └──> BoardView.visibleStatuses ──> <StatusColumn/> per status
```

**The store** (`lib/hidden-columns.ts`) keeps module-level state plus a listener set, exactly like
`focus-mode.ts`. Two constraints are load-bearing:

- `getSnapshot` must return a **stable reference**. The snapshot _is_ the array, replaced only inside
  a mutation; a no-op `setColumnHidden` returns early without touching it. Returning a fresh array
  per call makes `useSyncExternalStore` re-render forever.
- `parseHiddenStatuses` is pure and defensive. Absent, malformed, non-array, duplicate, and unknown
  members all degrade to "not hidden" — erring toward showing more, never less. Results are
  normalized to `STATUS_ORDER`, so a restored column reappears in its proper position rather than
  wherever it happened to be stored.

**No no-FOUC script.** Theme, focus, and zoom each stamp `<html>` before first paint and therefore
need an inline script plus (for the synced ones) `whenSynced` gating — see `CLAUDE.md` §3 and
`UNIT-15`. Hidden columns paint with the board after hydration, so none of that applies. Do not add
an inline script for this.

**Menu behavior.** Radix closes a dropdown on select, so every checkbox row calls
`event.preventDefault()` in `onSelect` — hiding three columns should not mean opening the menu three
times. `Show all columns` is a plain item and does close, since it is a one-shot reset.

**The empty state.** Hiding all eight is allowed rather than blocked at seven; the board area then
renders "Every column is hidden." with a restore button. The toolbar sits outside the column area
and always renders, so the menu is the real escape hatch — the empty state just says so where the
user is looking.

---

## How to test / verify

**Unit tests**

```bash
pnpm --filter @boardly/ui exec vitest run src/components/dropdown-menu.test.tsx
pnpm --filter @boardly/web exec vitest run lib/hidden-columns.test.ts components/board
```

- `packages/ui/src/components/dropdown-menu.test.tsx` — checkbox item semantics
  (`role="menuitemcheckbox"`, `aria-checked`), indicator present only when checked, disabled items
  inert, and the `preventDefault()`-keeps-the-menu-open contract.
- `apps/web/lib/hidden-columns.test.ts` (17) — the parser against `null`, malformed JSON, non-array
  JSON, unknown/non-string members, duplicates, and all eight statuses; plus store behavior:
  persistence, idempotent hide, no-op stability of the snapshot reference, subscriber notification
  and unsubscribe, and a `localStorage` that throws.
- `apps/web/components/board/columns-menu.test.tsx` (9) — all eight rows with filter-aware counts;
  hide/restore round-trip preserving `STATUS_ORDER`; the menu staying open across toggles;
  `Show all columns` disabled-then-restoring; hiding surviving a `showEmptyColumns` cycle; a card
  moving into a hidden column without resurrecting it; the all-hidden empty state; and zero counts
  under a match-nothing filter.
- `apps/web/components/board/column-menu.test.tsx` (5) — a menu on every column including empty
  ones; `Archive all` + `Hide` together on a populated column; hide with no dialog; cards left
  unarchived and undeleted; the last-column empty state.

**Tests this unit had to change** (all in `apps/web/components/board/column.test.tsx`):

1. The hide-empty test clicked a button that no longer exists — now drives the `Columns` menu, still
   asserting `getBoard(doc, "me").showEmptyColumns` flips, so board-meta coverage is preserved.
2. `shows no menu on an empty column (nothing to archive)` asserted behavior this unit deliberately
   reverses — rewritten as "offers Hide but not Archive all".
3. The `openMenu()` helper used a bare `getByRole("button", { name: "Column actions" })`, which
   matched all eight columns once every column gained a menu. The trigger's `aria-label` is now
   per-column (`"In Progress column actions"`) — better for screen readers anyway — and the helper
   takes a status.

**Gotcha for anyone writing more tests here:** Radix renders the menu as a modal, which `aria-hidden`s
the rest of the page. While a menu is open, `getAllByRole("region")` returns **zero** columns. Close
the menu before asserting anything about the board.

**E2E** (`apps/e2e/tests/board.spec.ts`) — needs the Docker db and a current `apps/web/out` build:

```bash
pnpm turbo build --filter @boardly/web && pnpm --filter @boardly/e2e e2e
```

Covers hide-from-3-dots → **reload** → still hidden (the only real proof of device-local
persistence), restore from the menu, a hidden column's card still listed in list view, and a
dark-mode screenshot baseline of the open menu (`snapshots/board.spec.ts-snapshots/columns-menu-dark-chromium-darwin.png`).
All 7 tests in `board.spec.ts` pass.

**One adjacent fix was required to get there.** The shared `addCard` helper did
`column.getByRole("button", { name: "Add card", exact: true })`, which has matched **two** elements
ever since UNIT-13 gave the column header a "+" carrying the same `aria-label` as the footer
composer button — a Playwright strict-mode violation that failed 6 of the 7 board tests before this
unit existed. The locator is now scoped to `column.locator("header")`.

**Pre-existing e2e drift (not caused by this unit).** `a11y.spec.ts`, `auth.spec.ts`, `card.spec.ts`,
`focus-mode.spec.ts`, and `list.spec.ts` still fail. This was verified rather than assumed: the same
specs were run from a detached worktree at `307b5f0` (the commit before this work), where they fail
too — in fact more of them do. Symptoms are a missing "Sign out" control, click timeouts, and a
~1%-pixel `list-grouped-dark` baseline diff. Unrelated to columns; see the repo's known gate drift.

**What "correct" looks like** (dark mode, per `DESIGN.md`): the trigger is quiet `text-fg-muted` at
`text-xs` with a `Columns3` icon, reading `Columns · 2 hidden` when something is hidden. Rows carry
the status icon in its status color, the name, a right-aligned `tabular-nums` count in `text-fg-faint`,
and an accent `Check` SVG in the right gutter when visible. No ad-hoc colors, no Unicode glyphs.

---

## Follow-ups / known gaps

- **Swimlane view ignores hidden columns.** It renders all eight statuses per lane and has no
  toolbar, so applying the preference there would leave no way to undo it. Revisit if that view gains
  a toolbar.
- **No agent path to hide or show a column** — by design, see above.
- **The preference does not sync across devices** — by design, see above.
- The `·` separator in the trigger label is typographic punctuation in prose, which `DESIGN.md` §7.1
  permits; the trigger carries a separate `aria-label` (`"Columns, 2 hidden"`) so screen readers get
  a clean reading.
