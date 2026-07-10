# UNIT V1.2: Linear-style filter builder (AND/OR, all fields + operators)

- **Plan unit:** V1.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 6)
- **Status:** done
- **Requirements:** R16 (filtering parity with Linear)
- **Dependencies:** V1.1 (done)
- **Commit(s):** _this unit's commit_

## What changed

Replaced the flat, AND-only filter editor with a **chip-based AND/OR builder** covering every card
field with its valid operators, plus one level of nested groups — composed from shadcn `Popover` +
`Command` primitives and the design tokens.

- **`apps/web/components/board/filter-builder.tsx`** (rewrite)
  - `FilterBuilder({ labels, filter, onChange })` — now takes `labels` as a prop (decoupled from the
    data layer; the parent supplies `useLabels(boardId)`), which also keeps it unit-testable.
  - `GroupEditor` (recursive, `depth`-capped at 1) renders a group's clauses as chips + nested group
    boxes, an **AND/OR toggle** ("Match all/any", shown at ≥2 children), a **+ Filter** picker, and
    (top level only) a **+ Group** button.
  - `AddFilter` — a `Popover` + `Command` searchable field picker ("Filter by…").
  - `ClauseChip` — a removable chip showing `Field · operator · value(s)`; clicking opens a `Popover`
    with the field's valid operators and a value editor.
  - `ValueEditor` — multi-select `listbox` for enums/labels (status, priority, severity, label),
    single-select for the due-date window, a text input for title; `is set`/`is empty` need no value.
  - `OPS` maps each field to only the operators `evaluateFilter` supports
    (`is`/`isNot`/`hasAny`/`hasAll`/`contains`/`isSet`/`isEmpty`/`isWithin`).
- **`apps/web/components/board/views.tsx`** — pulls `labels = useLabels(boardId)` and passes it to
  `FilterBuilder`.
- **`apps/web/components/board/filter-builder.test.tsx`** (new) — 8 tests (see below).
- **`vitest.setup.ts`** — added no-op `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`
  polyfills so Radix `Popover` opens under jsdom (the field picker + chip editor are Popover-based).
  Shared setup change; the full suite (all projects) stays green.

## Why

- **Parity with Linear (R16).** Linear's filter bar is add-filter → pick field → pick operator →
  pick values, with AND/OR and light nesting. The old editor only supported a flat AND of clauses.
- **`labels` as a prop, not a hook call.** Keeps `FilterBuilder` pure w.r.t. the Yjs data layer so
  it can be unit-tested with a fixed label set, and lets the parent own the subscription.
- **UI caps nesting at one level.** The model (`FilterGroup`) allows arbitrary depth, but deep
  nesting is hard to read; one level covers the common "A OR (B AND C)" shape. Enforced by only
  rendering **+ Group** at `depth 0` and not passing an add-group action into nested editors.
- **Operators scoped per field.** Surfacing only the operators `evaluateFilter` implements prevents
  building filters that silently never match.
- **Reused shadcn primitives.** `Popover` + `Command` (already in `@boardly/ui`) rather than a
  hand-rolled menu, restyled with tokens — matches the Views popover it lives in.

## How it works

The builder edits the same nestable `Filter` (`FilterGroup` = `{ op, clauses: (clause | group)[] }`)
from `@boardly/domain`. Every edit produces a new immutable `Filter` via `onChange`:

- **Add field** → append `defaultClause(field)` (a sensible starting operator + value per field).
- **Edit chip** → a popover of the field's operators (switching to `is set`/`is empty` drops the
  values; switching back seeds defaults) and a value editor appropriate to the operator's `kind`.
- **AND/OR** → flips `group.op`; shown once a group has ≥2 children.
- **+ Group** → appends `{ op: "and", clauses: [<default>] }`; the nested `GroupEditor` renders in a
  bordered box with its own AND/OR toggle and a remove control, but no further **+ Group**.
- **Remove** → drops the clause/group; an empty root filter shows "No filters — showing all cards"
  and matches everything (via `isEmptyFilter`/`evaluateFilter`).

Chip faces summarise values through the same option tables the editors use, resolving label ids to
names from the `labels` prop.

## How to test / verify

Prereqs: Node 22.17.1 (`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`).

- **Component tests:** `pnpm --filter @boardly/web test -- filter-builder` → **8 passed**. They drive
  the real Popover/Command UI in jsdom and assert the produced `Filter` + rendered chips:
  - empty state; add-field-as-chip (default clause); **operators scoped per field** (priority offers
    `is set` but not `has any of`; status offers only `is`/`is not`); multi-select enum values;
    **removing the last clause clears the filter** (and `evaluateFilter` then matches all); **OR of
    two clauses** evaluated with OR semantics; **one nested group** (AND inside) evaluated through the
    nesting, and asserting a nested group cannot spawn another; editing a **label** clause via the
    board's labels.
- **Whole suite:** `pnpm -r test` green — domain 72 / sync 38 / commands 9 / **web 125** (+8) / ui 2 /
  mcp 6 / server 26 (45 DB-gated skipped). `pnpm -r typecheck` / `-r lint` / `format:check` green;
  `pnpm --filter @boardly/web build` static export compiles.
- **Dark-mode screenshot (design gate):** captured the open filter builder against a real served
  build (signup → board → add Priority + Status chips → flip to Any). Reviewed vs `docs/design/
DESIGN.md`: dense chips (field muted / operator faint / value bold), the Match All/Any segmented
  toggle, `+ Filter`/`+ Group`, and the Command field picker — all on dark tokens, consistent with
  the surrounding Views popover. (The committed list-view visual baselines land in **V1.4**; V1.2's
  screenshot was a review capture, not a committed baseline.)

## Follow-ups / known gaps

- **Assignee values** are limited to the `@me` sentinel — there is no user directory yet, so `is`
  offers only "me" (plus `is set`/`is empty`). Expands when/if multi-user lands.
- **No reordering** of chips or moving a clause into/out of a group; remove + re-add covers it.
- The **Sort** and **Board↔List** controls that also live on this toolbar are **V1.4**; V1.2 is the
  filter editor only.
