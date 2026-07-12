# UNIT-7.10 — Web: Settings placement and the ESC escape ladder

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 10). Realizes R12 (Settings becomes the last full-width sidebar nav item) and R13 (ESC is a guarded escape ladder that ultimately falls back to the all-projects view). This is a placement move plus one keydown branch — behavior-preserving everywhere else. The board, commands, server, sync, and domain are untouched.

## What changed

- **`apps/web/components/app/workspace-app.tsx`**
  - **Settings placement (R12).** The Settings control moved out of the footer row. The sidebar markup was extracted into an exported `Sidebar` component whose main column now reads, top-to-bottom: logo → Search → `<ProjectList/>` (grows, `flex-1`) → **Settings** (a full-width nav item) → the account/theme footer. Settings is now a `<Button variant="ghost" size="sm">` styled to match the Search nav item (`w-full justify-start`, lucide `Settings` icon + "Settings" label), with an active `bg-selected text-fg` treatment (via `cn`, matching the ProjectList rows) when the settings route is open. It keeps `onClick={onOpenSettings}` (→ `setSettingsOpen(true)` → `#settings` hash) and `aria-pressed={settingsOpen}`. The footer `<div>` now holds only the account `Popover` button and `<ThemeToggle/>`.
  - **ESC escape ladder (R13).** The old inline `document` keydown effect (`/` + Shift+F) was promoted to an exported hook `useGlobalKeyboard({ onOpenSearch, settingsOpen, onExitSettings })` and extended with an `Escape` branch. A helper `escIsOwnedElsewhere(event)` decides when the ladder must yield.
  - `Shell` now composes `<Sidebar/>` and `useGlobalKeyboard(...)`; it memoizes `openSearch`/`exitSettings` with `useCallback` so the keydown listener isn't needlessly re-subscribed.
- **`apps/web/components/app/workspace-app.test.tsx`** — new. Component test for the sidebar order + Settings behavior (R12) and a `renderHook` test of the ESC ladder + its guards (R13).
- **`apps/e2e/tests/nav.spec.ts`** — new. e2e coverage for Settings-as-last-item placement, ESC-exits-Settings, and ESC-resets-scope-to-All. (Compiles; the live browser run is the orchestrator's job.)

## Why

- **Extract `Sidebar` + `useGlobalKeyboard` rather than edit inline.** The prior `Shell` rendered the whole `<aside>` inline and installed the keydown handler in an anonymous effect, neither of which is reachable by a unit test without mounting the full app (`SyncBridge`, `CommandPalette`, `MainArea` → `BoardView`, all of which need the sync provider). Pulling out a props-only `Sidebar` and a pure-ish hook keeps the change a markup move, but makes both new behaviors testable in isolation (a memory context for the sidebar; `renderHook` for the ladder). This mirrors the repo's existing "DOM-derived, unit-tested" split in `keyboard-nav.tsx`.
- **The ladder yields before it acts.** ESC is heavily overloaded — Radix dialogs/sheets/palette close on it, dnd-kit's keyboard sensor cancels a drag on it, and inline text fields use it. The new handler must never steal ESC from any of those. The guards reuse signals already used elsewhere: the shared editable-target guard (same `isEditableTarget` used by the `/`+Shift+F branch and by `keyboard-nav.tsx`), the `aria-pressed="true"` drag signal `keyboard-nav.tsx` uses, and Radix's `data-state="open"`.
- **Drag detection scoped to cards.** `keyboard-nav.tsx` checks `document.activeElement`'s `aria-pressed` because it is scoped to the board root. At `document` scope that heuristic would false-positive on the sidebar's own pressed toggles (the selected project row and the Settings item both carry `aria-pressed="true"`), which would wrongly suppress the scope reset right after selecting a project. So the guard is `document.querySelector('[data-nav="card"][aria-pressed="true"]')` — the dnd-kit-dragged card specifically — which reuses the same signal but can't match a sidebar toggle.

## How it works

`useGlobalKeyboard` installs one `keydown` listener on `document`:

1. **Shared guard (all branches).** Bail immediately on any modifier chord (`meta`/`ctrl`/`alt`) or an editable target (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`). This is why ESC while typing in a field never touches scope — it returns here before the ladder.
2. `/` → `onOpenSearch()`; Shift+F → `cycleFocus()` (unchanged).
3. `Escape` → run the ladder, but first yield via `escIsOwnedElsewhere(event)`, which returns `true` (→ do nothing) when any of:
   - `event.defaultPrevented` — a handler that ran earlier already consumed this ESC;
   - `document.querySelector('[data-nav="card"][aria-pressed="true"]')` — an active dnd-kit keyboard drag (dnd-kit cancels it);
   - `document.querySelector('[role="dialog"][data-state="open"]')` — an open Radix dialog/sheet/command-palette (Radix closes it).

   When nothing owns ESC, the ladder runs in order and calls `preventDefault()`:
   - if `settingsOpen` → `onExitSettings()` (`setSettingsOpen(false)`, back to the board);
   - else → `setSelectedProject(null)` (the module-level project-scope store from `use-projects.ts`; `null` = All).

The optional first rung (clear a keyboard-nav card focus before resetting scope) was skipped, per the plan's "optional" note — it doesn't compose cleanly with `keyboard-nav.tsx`'s DOM-derived focus and adds no observable benefit here.

`settingsOpen` is in the hook's dependency array, so the listener re-subscribes when the route flips — the closure always sees the current value (no ref needed). `setSettingsOpen` (from `useSettingsRoute`) and the memoized `openSearch`/`exitSettings` are stable, so toggling other state doesn't churn the listener.

## How to test / verify

Commands (pinned Node 22 bin):

```
export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
pnpm --filter @boardly/web run typecheck   # tsc --noEmit — clean
pnpm --filter @boardly/web run lint         # eslint . — clean
pnpm --filter @boardly/web run test         # vitest — 31 files, 164 tests pass
```

Results: typecheck and lint clean; full web suite **164 passed (31 files)**, including the 6 new `workspace-app.test.tsx` cases.

`workspace-app.test.tsx` covers:
- **R12** — the sidebar renders, in document order, logo → Search → Projects nav → Settings → account footer (asserted with `compareDocumentPosition`); the Settings item calls `onOpenSettings` on click and reflects `aria-pressed` (`false` closed, `true` when `settingsOpen`).
- **R13** — with `settingsOpen`, ESC calls `onExitSettings` and leaves scope untouched; with a project scoped and no Settings, ESC sets `getSelectedProject()` to `null`; ESC dispatched from a focused `<input>` leaves scope unchanged (editable guard); ESC with a `[role="dialog"][data-state="open"]` present leaves scope unchanged (ladder yields).

e2e (`apps/e2e/tests/nav.spec.ts`, compile-verified; not run here): Settings is positioned last above the account footer (via `boundingBox` y-order); clicking Settings opens the pane and ESC returns to the board; creating/selecting a project then pressing ESC re-selects "All". `apps/e2e` typechecks clean except the pre-existing, unrelated `focus-mode.spec.ts` DOM-lib errors.

Manual/dark-mode: pending at the orchestrator level per the plan (dark-mode screenshot of the sidebar with Settings as the last item above Account; ESC visibly stepping back to the all-projects board).

## Follow-ups / known gaps

- Live dark-mode screenshot verification is deferred to the orchestrator (per this unit's instructions).
- The `escIsOwnedElsewhere` dialog check is DOM-order-independent (queries for an open dialog) and does not rely on listener registration order relative to Radix; the `event.defaultPrevented` check is a secondary belt-and-braces signal.
