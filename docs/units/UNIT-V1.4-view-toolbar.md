# UNIT V1.4: View toolbar — layout switch, sort/group controls, saved views

- **Plan unit:** V1.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 6)
- **Status:** done
- **Requirements:** R15 (one view model, two lenses), R16 (filtering parity)
- **Dependencies:** V1.2, V1.3 (done)
- **Commit(s):** _this unit's commit_

## What changed

A compact view toolbar in the board header: a **Board \| List** switch (from V1.3), a **Sort** menu,
and a **Group** menu — all driving the shared `ActiveView`, so a saved view captures and restores the
whole lens (`filter + sort + groupBy + layout`).

- **`apps/web/components/board/views.tsx`**
  - New exported **`SortMenu`** — a `Popover` with a field list (Priority / Due date / Status / Title /
    Created / Updated), a "No sorting" clear, and an Asc/Desc direction toggle. Writes
    `Sort | null`.
  - New exported **`GroupMenu`** — a `Popover` with None / Status / Priority / Severity / Label /
    Assignee. **Consolidates** the old "Group by" chip section, which is removed from the Views popover.
  - Both menus are **controlled** (`open` state) and **close on selection**; each `PopoverContent`
    carries an `aria-label` ("Sort menu" / "Group by menu" / "Views menu") so the toolbar is
    unambiguous for keyboard/AT and for e2e scoping. Triggers carry stable `aria-label`s
    ("Sort" / "Group by" / "Views and filters") since their visible text reflects the selection.
  - `ViewsMenu` now only holds saved views + the filter builder + the save-as-view input;
    `customized` counts any lens dimension (filter, group, sort, or non-board layout).
- **`apps/web/components/app/workspace-app.tsx`** — renders `GroupMenu` + `SortMenu` next to the
  `LayoutSwitch`; each toolbar change writes the corresponding `ActiveView` field and clears the
  applied `view` (the lens is now "modified"). Board vs list still renders by `activeView.layout`
  (V1.3), and the list receives `activeView.sort`.
- **`apps/e2e/tests/list.spec.ts`** (new) — the list e2e + a committed dark visual baseline.
- **`apps/e2e/snapshots/list.spec.ts-snapshots/list-grouped-dark-chromium-darwin.png`** — baseline.

## Why

- **Saved views already round-trip the full lens** (V1.1 persisted `sort`/`layout`; the command zod
  schema allows `layout`). V1.4 just adds the controls that set `sort`/`groupBy`/`layout`, so
  save → change → re-apply restores everything.
- **Board is not forced through `resolveView`.** The plan's "both lenses call `resolveView`" is
  realized as _one shared model_ (`ActiveView`), not one renderer: the **list** uses `resolveView`
  (filter → sort → group); the **board** keeps its column/swimlane layout consuming `filter` +
  `groupBy`. `sort` is **list-only** — board cards are fractional-`ord` positioned and a global sort
  would fight drag-and-drop. Documented rather than shoe-horned.
- **Menus close on select + labelled popovers.** Two menus both offer "Status"; closing on select
  and labelling each popover keeps the toolbar unambiguous (and made the e2e deterministic).
- **A grouped board renders swimlanes,** so switching Board↔List while grouped shows lanes on the
  board and sections on the list — same grouping, two lenses.

## How it works

`ActiveView = { filter, view, groupBy, sort, layout }` is the single source of truth in `MainArea`.
The toolbar controls each write one field (and null the applied `view`); `LayoutSwitch` picks the
renderer; the list feeds `{ filter, sort, groupBy }` into `resolveView`. Saving a view snapshots the
whole `ActiveView`; applying one restores all five fields (`layout` defaults to `"board"` for legacy
views).

## How to test / verify

Prereqs: Node 22.17.1; Docker `boardly-db` up; `DATABASE_URL` exported.

- **E2E:** `pnpm --filter @boardly/e2e e2e` → **14 passed** (12 prior + 2 new). The list spec covers:
  sort by title (row order Apple/Banana/Cherry), group by status (a "Todo" section), Board↔List round
  trips preserving group+sort (grouped board shows a "Lane: Todo"), and **save → modify → re-apply**
  restoring layout+group+sort. Plus a committed **dark grouped-list** screenshot baseline (scoped to
  the list region so the per-run account avatar doesn't cause drift).
- **Unit/gates:** `pnpm -r typecheck` / `-r lint` / `format:check` green; `pnpm -r test` green
  (domain 72 / sync 38 / commands 9 / web 131 / ui 2 / mcp 6 / server 26, 45 DB-gated skipped);
  `pnpm --filter @boardly/web build` static export compiles.
- **Refresh the baseline** after intentional list UI changes:
  `pnpm --filter @boardly/e2e e2e list --update-snapshots`.

## Follow-ups / known gaps

- **Sort is list-only.** Applying a sort while on the board has no visible effect (documented);
  a "sorted board column" would require rethinking `ord`-based DnD and is out of scope.
- **One nesting level** in the filter builder (from V1.2) still applies.
- Phase 6 (v2 round 1) is complete with this unit; round 2 (multi-workspace Connections) and the
  desktop native-glue pass are sequenced next in the plan.
