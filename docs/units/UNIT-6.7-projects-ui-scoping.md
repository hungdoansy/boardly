# UNIT-6.7 — Projects: sidebar navigation, board scoping, create-time picker

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 7).

## What changed

Projects (Unit 6.6) are now surfaced in the UI: a sidebar list scopes the board/list to a project, and new cards land in the active project.

- **`apps/web/lib/use-projects.ts`** (new):
  - A tiny module store for the selected-project scope (`getSelectedProject` / `setSelectedProject` / `useSelectedProject` via `useSyncExternalStore`). Scope is view state (one board, one user), not a deep link, so it stays out of the URL.
  - `useProjects(boardId)` — live, ord-sorted, non-archived projects.
  - `useProjectActions(boardId)` — `create` (returns the new id) / `rename` / `recolor` / `archive`.
- **`apps/web/components/board/project-list.tsx`** (new): the sidebar "PROJECTS" section — an "All" row (clears scope) plus one row per project (color dot + name), with an "Add project" button that creates and selects a project. `aria-pressed` marks the active scope.
- **`packages/domain/src/filters.ts`** — added `"project"` to `FilterField` and a `matchesClause` case (`is` / `isSet` / `isEmpty`) so project scope is expressed as an ordinary filter clause.
- **`apps/web/components/app/workspace-app.tsx`** — mounts `ProjectList` in the sidebar (below the compact single-board list) and, in `MainArea`, ANDs a `project is <id>` clause onto the saved-view filter when a project is scoped. That single `filter` already threads to columns, reclaim, swimlanes, and the list view — so scoping works everywhere with no per-component plumbing.
- **`apps/web/lib/use-board.ts`** — `useCardActions.create` reads the active project scope and passes it as `projectId`, so cards created while scoped belong to that project (the "pick at creation" flow, Linear-style).
- **`apps/web/components/board/filter-builder.tsx`** — `"project"` added to the exhaustive field maps but excluded from the manual field dropdown (scope is sidebar-driven, never hand-built).
- **`apps/web/components/board/board-list.tsx`** — made compact (`shrink-0`) so the project list gets the sidebar's vertical space.

## Why

- Product decision (user, R3): projects need a home and must scope what you see. A sidebar list mirrors Linear's team/project switcher.
- **Scope via the existing `filter`**: rather than thread a new prop through every card-list component, project scope is one clause ANDed with the saved-view filter. `evaluateFilter` already runs everywhere cards are shown, so this is the minimal, consistent integration.
- **Active-project create** (not a per-composer dropdown): the user picks the project by selecting it in the sidebar, and new cards inherit it — one-click, matches "you're in a project, you create issues there". A per-card project picker can come later.
- **Module store for scope** (not URL/context): scope is transient view state for a single-board, single-user app; a store avoids prop-drilling across the sidebar/main-area boundary and keeps the ticket URL (Unit 6.3) clean.

## How it works

Selecting a project calls `setSelectedProject(id)`; `MainArea` re-renders, appends `{ field: "project", condition: "is", values: [id] }` to the filter, and every card list filters to that project. "All" sets the scope to `null` (no clause). Creating a card calls `createCard` with `projectId = getSelectedProject()`.

## How to test / verify

- **Domain** (`packages/domain/src/filters.test.ts`, green): the `project` clause — `is` matches only that project, `isSet`/`isEmpty` partition projected vs. unprojected cards.
- **Sidebar** (`apps/web/components/board/project-list.test.tsx`, green): lists "All" + projects with "All" selected by default; selecting a project flips `aria-pressed`; "Add project" creates a project through the command layer and selects it.
- Typecheck + lint + full web suite (156 tests) + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.
- **Browser (dark mode, verified live):** signed up fresh → the sidebar shows a **PROJECTS** section with "All" selected; clicking "Add project" created **"New project"** (red default dot) and selected it as the active scope (screenshot captured). This exercises the create + select + scope path end-to-end.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

## Follow-ups / known gaps

- **Rename/recolor/archive** of projects have hooks (`useProjectActions`) but no UI yet — that lands in Settings (Unit 6.8). Newly created projects are all named "New project" until renamed there.
- **No per-card project reassignment UI** in the drawer (deferred in the plan). Cards created in "All" scope have no project; assigning them later needs the drawer picker (future).
- The default project color is `DEFAULT_LABEL_COLOR` (red); a project-specific palette/rotation could be nicer.
