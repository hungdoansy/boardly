# UNIT 14.3: Global "new task" shortcut (`c`)

- **Plan unit:** 14.3 (`docs/plans/2026-07-24-001-feat-keyboard-shortcuts-nav-plan.md`)
- **Status:** done
- **Requirements:** R2, R5
- **Commit(s):** _pending_

## What changed

- **Modify `apps/web/components/app/workspace-app.tsx`**:
  - Add `openNewTaskComposer()` — a module-level DOM helper that opens the **Todo**
    column's inline composer (`[data-nav-column="todo"] [data-nav-composer]`) and no
    other. No-op when that composer isn't in the DOM.
  - Add a `c` (`e.code === "KeyC"`) branch to `useGlobalKeyboard` that opens it.
- Tests in `apps/web/components/app/workspace-app.test.tsx`.

## Why (decisions)

- **Reuse the composer + command layer, not a new mutation path.** The composer's
  create already inherits the active project scope (`getSelectedProject`) and
  defaults to Todo, so "open composer in current scope" needs no new wiring.
- **Unify `c` on one key across layers.** The board's `c` (a focused column's
  composer) calls `preventDefault()` when it acts; the document handler bails on
  `e.defaultPrevented`, so a focused-column `c` is untouched and only a
  board-empty-space / sidebar `c` opens the Todo composer. No double composer.
- **Yield while an overlay owns the keyboard** — bail via the shared `isOverlayOpen()`
  (`apps/web/lib/keyboard-ownership.ts`), mirroring the ESC ladder's ownership check.
  Editable targets are already filtered by the shared top-of-handler guard.
- **DOM query over new context plumbing** — matches `keyboard-nav.tsx`'s existing
  `openComposer`, keeping the "focus lives in the DOM" philosophy.
- **Todo-only, no wrong-status fallback** (revised after ce:review): the handler
  targets the Todo composer _only_. It does **not** fall back to the first
  `[data-nav-composer]` in DOM order — that belongs to Backlog (which precedes Todo in
  `STATUS_ORDER`), so a fallback would silently create the card in the wrong status.

## How it works

`c` → `useGlobalKeyboard` (bubble, document): if the board already handled it
(`defaultPrevented`) or an overlay is open, bail; otherwise `openNewTaskComposer()`
finds the Todo composer element and clicks it (opening the autofocused input) or
focuses it if already open. The user types a title; Enter creates the card in the
current scope.

## How to test / verify

- `workspace-app.test.tsx` "Global shortcuts": `c` clicks a mounted Todo composer;
  `c` yields while a dialog is open; `c` does nothing while typing in a field.
- Manual: with nothing focused, `c` opens the Todo composer; with a card focused,
  `c` opens that card's column composer (board behavior, unchanged); from the
  sidebar, `c` opens the Todo composer.

## Follow-ups / known gaps

- **`c` is a no-op when the Todo composer isn't in the DOM** — i.e. Todo is empty with
  "hide empty columns" on, or the **List** layout is active (list view renders no
  `[data-nav-composer]`). This is deliberate (see the no-fallback decision above):
  a no-op is safer than creating a card in the wrong status/column. A future
  enhancement could make `c` create a Todo card via the command layer directly (like
  the palette's "New card") so it works in every layout.
