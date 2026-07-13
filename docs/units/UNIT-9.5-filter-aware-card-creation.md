# UNIT-9.5 — Filter-aware card creation

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 6).

## What changed

Adding a card while a filter is active now seeds the new card's project, priority, and labels from
that filter, so the card satisfies the filter and stays visible instead of vanishing.

- **Domain** (`packages/domain/src/filters.ts`): new `CardDefaults` interface + `deriveCardDefaults(filter)`.
  It reads only the **top-level AND** group's direct clauses: `priority is X` and `project is X`
  (single value only), and `label hasAny/hasAll [...]` (all values). A top-level OR, nested groups,
  negations, ranges, and title/assignee/status clauses are ignored. (Auto-exported via the
  `export * from "./filters"` barrel.)
- **Sync** (`packages/sync/src/board-doc.ts`): `AddCardParams` gains `labelIds`; `addCard`
  populates the card's `labels` set from it. (`priority` was already added in UNIT-9.3, including
  the Urgent-to-top placement.)
- **Commands** (`packages/commands/src/commands/card.ts`): `createCard` input accepts optional
  `priority` (0–4) and `labelIds`, passed through to `addCard`.
- **Web hook** (`apps/web/lib/use-board.ts`): `useCardActions().create(title, status, defaults?)`
  — merges `defaults` (project falls back to the sidebar scope when not filter-derived).
- **Board** (`apps/web/components/board/column-cards.tsx`): derives `deriveCardDefaults(filter)`
  from the active (effective) filter and passes it to both the quick composer and the "add with
  details" path.

## Why

- A filter is arbitrary, so only unambiguous equalities can safely seed a card: a single
  `priority is`/`project is` value, and label `hasAny/hasAll` values (seeding all satisfies
  either). Multi-value priority/project is skipped because a card has exactly one of each.
- Reading the **effective** filter subsumes the old sidebar-project seeding: `MainArea` already
  ANDs the sidebar project scope into the filter as a `project is [id]` clause, so the same code
  path handles both "scoped to a project" and "filtered to a priority/label".
- Top-level-only (ignore nested groups) keeps the derivation predictable and avoids guessing from
  complex composed filters — a documented, conservative limitation.

## How it works

`column-cards` memoizes `deriveCardDefaults(filter)` and hands it to `create`. `create` merges
project (filter-derived, else sidebar scope) and forwards priority/labels to the `createCard`
command → `addCard`, which sets the label set and (for Urgent) slots the card at the top of its
column (UNIT-9.3). `swimlanes` is a read-only triage view with no composer, so it needs no change.

## How to test / verify

- **Unit tests (all green):**
  - `packages/domain/src/filters.test.ts` (`deriveCardDefaults`): single `project is` → projectId;
    `priority is` + `label hasAny` → both; union across multiple label clauses; top-level OR → {};
    negations/ranges/text/assignee/status ignored; multi-value priority skipped; nested groups
    ignored while sibling clauses still read; empty filter → {}.
  - `packages/commands/src/commands/card.test.ts`: `createCard` persists a seeded priority + labels
    and an Urgent-seeded card lands at the top of its column.
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e`
  DOM-lib break, unrelated); lint clean (exit 0); `vitest run` = 431 passed / 37 skipped;
  `@boardly/web` build compiles.
- No new visible UI surface (behavioral change to the existing composer), so no dark-mode
  screenshot applies. Manual check: apply a priority/project/label filter, add a card, confirm it
  appears with those fields and stays visible under the filter.

## Follow-ups / known gaps

- **Nested-group limitation:** when both a saved-view filter (nested) and a sidebar project scope
  are active, only the project seeds — the nested view's priority/labels are not read (top-level
  only, by design). A single active view (no scope) seeds fully because its clauses are top-level.
