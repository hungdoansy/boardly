# UNIT V1.3: List view

- **Plan unit:** V1.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 6)
- **Status:** done
- **Requirements:** R15 (one view model, two lenses), R17 (list ergonomics), R2 (perf)
- **Dependencies:** V1.1 (`resolveView`) — done
- **Commit(s):** _this unit's commit_

## What changed

A dense, keyboard-navigable **list lens** over the same cards the board shows, rendered from the
shared `resolveView` pipeline so filter/sort/group stay identical across lenses.

- **`apps/web/components/board/list-view.tsx`** (new)
  - `ListView({ boardId, filter, groupBy, sort })` — container: reads `useAllCards` + `useLabels` +
    `useBadgeConfig`, computes `resolveView(cards, { filter, sort, groupBy }, ctx)`, renders the body,
    and mounts `CardDetail` (opened via `useSelectedCard`, the same hash-routed selection the board
    uses). On close it restores focus to the originating row.
  - `ListBody({ resolved, labelById, config, groupBy, onOpen })` — **pure** presentational body
    (exported for unit tests): grouped `<section>`s with a sticky header (`groupLabel` + count) when
    grouped, else a flat list. Handles `↑/↓` roving focus and `Enter`/`Space` to open the focused row.
  - `ListRow` — a `role="button"` row: leading `StatusIcon`, mono `shortId`, title (struck through +
    dimmed for terminal statuses via `isTerminalStatus`, matching the board), the reused `BadgeRow`
    (board badge config **minus** `status`, which the row shows as its own glyph), and an assignee
    initials chip when set.
- **`apps/web/components/app/workspace-app.tsx`**
  - Renders `ListView` vs `BoardView` by `activeView.layout`.
  - Adds a minimal **Board | List** segmented switch (`LayoutSwitch`) in the header that sets
    `activeView.layout`. (V1.4 grows this toolbar with the Sort + Group menus and saved-view capture.)
- **`apps/web/components/board/list-view.test.tsx`** (new) — 6 tests (see below).

## Why

- **One model, two lenses (R15).** The list calls the same `resolveView` the board will adopt in
  V1.4 — no forked filter/sort/group logic.
- **Pure `ListBody` split.** `ListView` (hooks/data) is thin; `ListBody` is pure over a
  `ResolvedView`, so grouping/rows/keyboard are unit-tested directly without standing up hash routing
  or a Yjs doc. The detail-open flow (hash-routed `useSelectedCard`) is asserted via the click →
  `onOpen` seam here and end-to-end in **V1.4**'s Playwright spec.
- **Cheap windowing, not a dep (R2/R17).** Each row uses CSS `content-visibility: auto` +
  `contain-intrinsic-size` so the browser skips layout/paint for offscreen rows — hundreds of rows
  stay smooth without pulling in a virtualization library. Documented as a follow-up if true
  virtualization is ever needed.
- **Status glyph, not a status badge.** Linear-style lists lead with the workflow-status icon; the
  row drops `status` from the badge row to avoid duplicating it.
- **Minimal layout switch now.** A list you cannot open isn't "done" (the DoD needs the screenshot),
  so the Board↔List switch is introduced here; V1.4 layers Sort/Group/saved-views on the same bar.

## How it works

`resolveView` (V1.1) turns `{ filter, sort, groupBy }` into `{ grouped: CardGroup[] }` or
`{ flat: Card[] }`. `ListBody` renders whichever it gets:

- **Flat** → rows in the resolved order.
- **Grouped** → one `<section aria-label="Group: <label>">` per lane, sticky header with the lane
  label (`groupLabel`, resolving label ids to names) and the lane count.
- **Empty** (`flat` empty or no lanes) → "No cards match." empty state.

Keyboard: the list container handles `↑/↓` (roving focus across `[data-nav="row"]`) and
`Enter`/`Space` (open the focused row); rows are also clickable. Opening calls `onOpen(cardId)` →
`useSelectedCard` writes the hash → `CardDetail` renders; closing restores row focus.

## How to test / verify

Prereqs: Node 22.17.1 (`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`).

- **Component tests:** `pnpm --filter @boardly/web test -- list-view` → **6 passed**:
  - _Data path (`ListView` over a real memory-context board):_ flat rows in card order; grouped
    sections with correct counts (group by status); empty state when a filter matches nothing;
    terminal cards struck through.
  - _Interaction (`ListBody` + spy):_ clicking a row calls `onOpen(cardId)`; `↑/↓` move focus and
    `Enter` opens the focused row.
- **Whole suite:** `pnpm -r test` green — domain 72 / sync 38 / commands 9 / **web 131** (+6) / ui 2 /
  mcp 6 / server 26 (45 DB-gated skipped). `pnpm -r typecheck` / `-r lint` / `format:check` green;
  `pnpm --filter @boardly/web build` static export compiles.
- **Dark-mode screenshots (design gate):** captured the list against a served build — **flat**
  (status glyph + mono `shortId` + title + row dividers, Board|List switch in the header) and
  **grouped by status** (uppercase lane header + count). Reviewed vs `docs/design/DESIGN.md`: dense,
  quiet chrome, single accent, consistent with the board. Committed visual baselines land in **V1.4**;
  these were review captures.

## Follow-ups / known gaps

- **Sort/Group controls + saved-view capture** for the list are **V1.4**; V1.3 wires the render path
  and a bare layout switch only.
- **Windowing is `content-visibility`-based**, not true virtualization — sufficient for hundreds of
  rows; revisit with a windowing lib only if profiles show it's needed at larger scale.
- **Assignee** shows an id-derived initials chip (no user directory yet).
- **Board still filters/groups via its own props** — V1.4 switches the board to `resolveView` too so
  the pipeline lives in exactly one place.
