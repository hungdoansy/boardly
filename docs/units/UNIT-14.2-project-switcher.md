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

## Review follow-ups (ce:review)

- **Icon sizing (project-standards, P2).** The `Box`/`Boxes` row glyphs use `size-3.5`
  (14px) per DESIGN.md §7.1's binding menu/list-item rule (fixed from `size-4`).

## Numbered project chords + sidebar badges (follow-up)

- **Create `apps/web/lib/use-project-hotkeys.ts` (+ `.test.ts`).** `⌘/Ctrl 1…5`
  jump to the first five sidebar destinations; `⌘/Ctrl 6` opens the switcher. The
  sidebar list starts with **All**, so slot 1 (`⌘1`) is All and `⌘2…5` are the first
  four projects. The pure `resolveProjectHotkey(code, visibleProjectCount)` maps
  `Digit1` → `{kind:"all"}`, `Digit2…5` → the project index `slot-1` (only when it
  exists — `⌘4` with two projects is a no-op that leaves the key to the browser), and
  `Digit6` → the switcher; the hook reads the live project list from a ref so its one
  `document` listener never churns. `projectBadge(index)` / `NUMBERED_SLOT_COUNT` (= 5)
  are the single source shared with the sidebar badges.
- **Modify `apps/web/components/app/workspace-app.tsx`** — `Shell` calls
  `useProjectHotkeys(openSwitcher)` next to the leader wiring; `⌘6` reuses the same
  `openSwitcher` as `g p`.
- **Modify `apps/web/components/board/project-list.tsx`** — the All row shows badge
  `1` and the first four project rows show `2…5` (a faint right-aligned `<kbd>`,
  matching the sidebar Search row's `/` hint). The name gets `min-w-0 flex-1 truncate`
  so it truncates before the badge.

**Why All is `⌘1` (not unnumbered):** the sidebar reads top-to-bottom as All, P1, P2,
… and there must be a chord back to the full board — so All takes slot 1 and projects
shift to `⌘2…5` (four numbered projects). This matches the visual order 1:1.

**Why plain digits (not shown as `⌘N` in the badge):** the dense sidebar row has
little room; a bare `1…5` reads as an ordinal hint and the `?` overlay + DESIGN §5
carry the full `⌘N` spelling. Chosen over `e.key` digits so it stays layout-independent
(`e.code === "Digit1"`).

**Platform note:** browsers bind `⌘/Ctrl 1…8` to tab-switching and may not deliver the
event to the page; the chord is reliable in the desktop (single-window) webview.
`preventDefault` is best-effort on web.

## Fix: sidebar focus ring was clipped

- The project `<ul>` uses `overflow-y-auto`, which per CSS also computes `overflow-x`
  to `auto` — clipping the 2px `:focus-visible` ring at each row's left/right edge.
  Added `-mx-1 px-1 py-0.5` so the ring has room while rows keep their original x
  position (the negative margin stays within the parent `nav`'s `px-2`).

## Follow-ups / known gaps

- Discoverability entry ("Go to project…") in the command palette lands in
  **UNIT 14.5**.
- `⌘1…5` on web may be swallowed by the browser's tab shortcuts (see Platform note);
  fully reliable only in the desktop webview.
