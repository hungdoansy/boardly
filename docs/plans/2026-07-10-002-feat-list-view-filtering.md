---
title: "feat: Boardly v2 round 1 — list view + Linear-style filtering"
type: feat
status: active
date: 2026-07-10
origin: docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md
---

# feat: Boardly v2 round 1 — list view + extensive filtering

## Overview

The full build (plan `2026-07-09-001`, 41 units) is complete. This is **round 1 of v2**: add a
**list view** and **Linear-style filtering**, so Boardly works as a cross-workspace / personal
**ticket tracker**, not just a board.

The engine already exists from Unit 4.1: a nestable `Filter` (`AND`/`OR`), `evaluateFilter`,
`sortCards`, `groupCards`/`groupLabel`, `SavedView` (already holds `filter`/`sort`/`groupBy`/
`visibleBadges`), and presets. This round is mostly **new UI + wiring** on top of that model — no new
architecture. Board and list are two lenses over **one shared view model**.

**Scope guardrails (agreed with the user):**

- **In:** list view, full filter builder (AND/OR + all fields/operators), sort + group controls, a
  Board↔List layout switch, saved views that capture the whole view.
- **Out (later rounds):** multi-workspace Connections (round 2, link-only); Connected mode (OAuth /
  Linear status sync / Slack posting); quick-capture hotkey, recurring tasks; the desktop
  native-glue + package/sign pass (after rounds 1–2).
- **Reuse rule:** anything platform-touching goes through the existing `isTauri()` switch. This round
  shouldn't need it (pure UI over local Yjs data), keeping the later desktop pass thin.

## Requirements Trace (additions to `2026-07-09-001`)

- **R14 — One view model, two lenses:** board and list render from a single
  `{ filter, sort, groupBy, layout }` model; a **saved view** restores all of it. No forked logic.
- **R15 — Filtering parity with Linear:** nestable `AND`/`OR` across every card field
  (status, priority, severity, label, assignee, dueDate, title) with per-field operators, edited via
  a chip/add-filter bar; empty filter = everything.
- **R16 — List ergonomics:** dense, keyboard-navigable rows; group sections with counts; sortable;
  row opens the card detail. Perf: virtualize/window if a list exceeds a threshold (R2).

## Definition of Done

Per-unit DoD is inherited verbatim from `CLAUDE.md` §6 and plan `2026-07-09-001`'s Operational
notes: unit tests + typecheck/lint/build green; user-facing flows get a Playwright e2e + **dark-mode
(and light) screenshot** checked against `docs/design/DESIGN.md`; shadcn/ui + design tokens only;
exact-version deps; the `docs/units/UNIT-<id>-<slug>.md` doc written and committed; commit per unit
with the `Co-Authored-By: Claude Opus 4.8` footer. No push / no branch without explicit go-ahead.

## Units

- [ ] **Unit V1.1: Shared view model (`filter + sort + group + layout`)**

**Goal:** one source of truth for a "view" that both board and list consume; saved views round-trip it.
**Requirements:** R14.
**Dependencies:** 4.1, 4.2 (done).
**Files:** `packages/domain/src/filters.ts` (add `layout` to `SavedView`; add a pure `applyView`
helper), `packages/domain/src/filters.test.ts`; `apps/web/components/board/views.tsx` (`ActiveView`
gains `sort` + `layout`), `apps/web/lib/use-views.ts`, `apps/web/components/app/workspace-app.tsx`.
**Approach:** Add `layout?: "board" | "list"` to `SavedView` (default `"board"`). Add
`applyView(cards, { filter, sort, groupBy }, ctx)` that composes the existing
`evaluateFilter`→`sortCards`→`groupCards` into a single result (`{ grouped: CardGroup[] } | { flat:
Card[] }`), so board/list never re-implement the pipeline. Extend `ActiveView` to
`{ filter, sort, groupBy, layout, view }` and persist all of it when saving a view.
**Test scenarios:**

- Happy path — `applyView` filters, then sorts, then groups; ungrouped returns a stable flat sort.
- Edge — empty filter + no sort returns all cards in board order; a saved view restores
  filter+sort+group+layout exactly (serialize→parse round-trip).
  **Verification:** domain unit tests for `applyView` + `SavedView` round-trip pass.

- [ ] **Unit V1.2: Linear-style filter builder (AND/OR, all fields + operators)**

**Goal:** replace the AND-only builder with a chip-based, nestable filter editor covering every field.
**Requirements:** R15.
**Dependencies:** V1.1.
**Files:** `apps/web/components/board/filter-builder.tsx` (rewrite), `apps/web/components/board/
views.tsx`; add `filter-builder.test.tsx`.
**Approach:** A filter **chip bar**: "+ Filter" → pick field → operator (scoped to the field) →
value(s) (multi-select for enums/labels/assignee; text for title; window for dueDate). Support an
`AND`/`OR` toggle per group and one level of nested groups (the model already allows deeper; UI caps
at one nest for clarity). Operators map to what `evaluateFilter` already supports
(`is`/`isNot`/`hasAny`/`hasAll`/`contains`/`isSet`/`isEmpty`/`isWithin`). Each active clause renders
as a removable chip; empty builder = no filter. Reuse shadcn `Popover`/`Command` primitives + tokens.
**Test scenarios:**

- Happy path — build `priority is High OR (label hasAny [bug] AND status isNot Done)`; the emitted
  `Filter` matches the intended cards via `evaluateFilter`.
- Edge — removing the last clause clears the filter (matches all); switching a group AND↔OR
  re-evaluates; an enum field offers only valid operators.
  **Verification:** component tests build filters and assert the produced model + rendered chips;
  dark + light screenshots of the filter bar.

- [ ] **Unit V1.3: List view**

**Goal:** a dense, keyboard-navigable list lens over the same cards, grouped/sorted per the view.
**Requirements:** R14, R16, R2.
**Dependencies:** V1.1.
**Files:** Create `apps/web/components/board/list-view.tsx` (+ a `ListRow`), wire into the board
container; `list-view.test.tsx`.
**Approach:** Render `applyView` output as rows: group section headers (with count, via `groupLabel`)
when `groupBy` set, else a flat sorted list. Each row shows status icon, title, `shortId`, the badge
row (reuse `BadgeRow`), due chip, and assignee; hover affordances match the board. Click or `Enter`
opens the card detail (reuse `CardDetail` + `useSelectedCard`); `↑/↓` move the row focus (reuse the
keyboard-nav conventions). Window the list (simple virtualization) past a threshold so hundreds of
rows stay smooth. No new mutations — reordering/editing still go through the command layer via the
detail panel and existing row actions (archive).
**Test scenarios:**

- Happy path — a filtered+sorted list shows the right rows in order; grouped mode shows sections with
  correct counts; clicking a row opens its detail.
- Edge — empty result shows an empty state; keyboard ↑/↓ + Enter opens a card; terminal cards render
  dimmed/struck like the board.
  **Verification:** component tests (rows, grouping, open-on-click/Enter); dark + light screenshots
  (flat and grouped).

- [ ] **Unit V1.4: View toolbar — layout switch, sort/group controls, saved views**

**Goal:** switch Board↔List, choose sort + grouping, and save/restore the whole view.
**Requirements:** R14, R15.
**Dependencies:** V1.2, V1.3.
**Files:** `apps/web/components/board/views.tsx` (toolbar: layout segmented control + Sort + Group
menus, consolidating the existing group-by selector), `apps/web/components/app/workspace-app.tsx`
(render board or list by `activeView.layout`); `apps/e2e/tests/list.spec.ts`.
**Approach:** A compact toolbar next to the existing Filter menu: **Board | List** segmented switch;
a **Sort** menu (field + asc/desc); a **Group by** menu (reuse V1.1). Persist `layout`/`sort`/
`groupBy` into the active view and into saved views, so applying a saved view restores the exact
lens. Board and list both call `applyView`.
**Test scenarios:**

- Happy path (e2e) — create cards; filter to a subset; sort by priority; group by status; switch to
  List and back — content stays consistent; save as a view, change things, re-apply the view →
  filter+sort+group+layout all restored.
- Edge — a preset view renders in list mode; switching layout preserves the active filter.
  **Verification:** Playwright e2e green against the served build + live server; dark + light
  screenshots of the list (grouped) and the layout switch, reviewed vs `DESIGN.md`.

## Sequencing after this plan

1. **Round 1 (this plan):** list view + filtering.
2. **Round 2:** multi-workspace **Connections (link-only)** — Connections settings, per-link
   workspace tag, and the provider badge (workspace **initial + color**, shown only when >1
   connection of that provider). Separate plan.
3. **Desktop pass (reuse-first):** the same web bundle already runs under Tauri (Units 5.1/5.2), so
   this is a focused **native-glue + package/sign** pass — desktop keychain auth handshake,
   deep-link routing, due-date notifications, a global **quick-capture hotkey**, then build/sign.
   Separate plan. Every round-1/2 feature is already in the desktop for free.

## Notes / open questions carried forward (round 2, not now)

- Slack: attach/open links only, or also **post** to Slack from a card? (Decide before round 2.)
- Link-only vs **Connected** (Linear API status sync) — deferred; round 1/2 stay link-only.
