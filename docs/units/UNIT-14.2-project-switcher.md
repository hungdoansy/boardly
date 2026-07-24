# UNIT 14.2: Project Switcher (`g` then `p`)

- **Plan unit:** 14.2 (`docs/plans/2026-07-24-001-feat-keyboard-shortcuts-nav-plan.md`)
- **Status:** done
- **Requirements:** R1, R4
- **Commit(s):** _pending_

## What changed

- **Create `apps/web/components/command-palette/project-switcher.tsx`** — a `cmdk`
  `CommandDialog` listing "All" + every live project. Typing filters; arrow keys
  move between rows; selecting a row jumps the board scope via `setSelectedProject`
  (All = `null`) and closes.
- **Create `apps/web/components/command-palette/project-switcher.test.tsx`**.
- **Modify `apps/web/components/app/workspace-app.tsx`** — `Shell` owns
  `switcherOpen`; `useLeaderHotkeys(LEADER_REGISTRY, { "project-switcher": … })`
  binds `g` `p` to open it; the dialog is mounted alongside the palette.

## Why (decisions)

- **One mechanism for "move between projects" + "quick-switch".** Arrow-key list
  navigation and typeahead inside the switcher cover both; no separate `[`/`]`
  cycling was added (the user chose the `g p` switcher over brackets).
- **Reuse the routing setters, not new state.** Selecting a project drives the URL
  hash (`setSelectedProject` / `formatProjectRef`), so scope changes are linkable
  and get back/forward for free, and no parallel state is introduced.
- **Same visual language as the palette** — `CommandItem`'s `bg-selected` + accent
  left-border (from `UNIT-2-cmdk-contrast`), `Boxes` for All / colored `Box` per
  project (SVG icons, no glyphs), sr-only `DialogTitle` via `CommandDialog title`.

## How it works

`g` `p` → `useLeaderHotkeys` runs the `project-switcher` handler → `setSwitcherOpen(true)`.
The dialog reads `useProjects()` (live Yjs list); `onSelect` calls
`setSelectedProject(project ? formatProjectRef(id, name) : null)` then closes.
Re-selecting the current project is idempotent (`writeHashBody` no-ops on an
unchanged hash, so no spurious history entry).

## Design (UI)

- Tokens/components: `CommandDialog`/`CommandInput`/`CommandList`/`CommandItem`
  (shadcn/cmdk), `--bg-selected` selected row, `--accent` left-border, `Boxes`/`Box`
  lucide icons colored via `project.color`. Dark-mode-first; matches the existing
  palette. Screenshot: _to attach in review_ (dark).

## How to test / verify

- `project-switcher.test.tsx`: selecting a project scopes the board (`getSelectedProject`);
  selecting All resets to null; typing filters the list; with no projects only All
  is offered. Leader wiring (`g` `p` opens it, capture-phase precedence) is covered
  by `apps/web/lib/hotkeys.test.ts`.
- Manual: `g` `p` opens the switcher from the board, the sidebar, and with a card
  focused (priority must NOT cycle — proves the capture fix).

## Follow-ups / known gaps

- Discoverability entry ("Go to project…") in the command palette lands in
  **UNIT 14.5**.
