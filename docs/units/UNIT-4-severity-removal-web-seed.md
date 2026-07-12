# UNIT 4: Remove `severity` — web UI and seed script

- **Plan unit:** 4 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R3
- **Commit(s):** `4fd53a0`

## What changed

- Deleted `apps/web/components/card/severity-badge.tsx` and
  `severity-select.tsx` outright.
- `apps/web/components/card/badge-row.tsx` — removed the `SeverityBadge`
  import and its `collectBadgeNodes` branch.
- `apps/web/components/card/card-detail.tsx` — removed the "Severity" row +
  `SeveritySelect` import/usage from the drawer's property list.
- `apps/web/components/card/activity.tsx` — removed the `SEVERITY_META`
  import, the `case "severity":` branch in the activity-log description
  renderer, and the now-unused `Signal` icon import. (This file is a
  separate UI-layer activity renderer from `packages/domain/src/activity.ts`,
  which Unit 3 already handled — missed in the original plan draft, caught by
  the feasibility-reviewer pass during document-review.)
- `apps/web/components/board/filter-builder.tsx` — removed the `Severity`
  import, `"severity"` from `ValueKind`, `FILTER_OPS_BY_KIND`/`OPS.severity`,
  `FIELD_LABELS.severity`, `SEVERITY_OPTS`, and the `"severity"` cases in
  `optionsFor`/`defaultClause`.
- `apps/web/components/board/views.tsx` — removed the `{ value: "severity", label: "Severity" }`
  entry from `GROUP_OPTIONS`.
- `apps/web/lib/use-board.ts` — removed the `setSeverity` action and
  `setCardSeverity` import.
- `packages/sync/scripts/seed-demo-board.ts` — removed the `Severity`/`SeverityValue`
  import, the `severity` field from `CardSpec`, every per-card `severity:`
  assignment, the "severity" mentions in the kitchen-sink card's markdown
  description, and `"severity"` from the seeded `badgeConfig` array.
- Renamed `apps/web/components/card/priority-severity.test.tsx` →
  `priority.test.tsx` (its severity `describe` block deleted; priority
  coverage unchanged).
- Tests updated: `card.test.tsx` (Zen-focus test now uses priority instead of
  severity as the probe field), `badge-row.test.tsx` (checklist instead of
  severity as the ordering-test field, since severity no longer exists as a
  configurable badge), `filter-builder.test.tsx`, `list-view.test.tsx`,
  `swimlanes.test.tsx` (card factories / local `GroupByField`-shaped types).

## Why (decisions)

- **Same mechanical, type-checker-guided approach as Unit 3, one layer up.**
  `tsc --noEmit` on `@boardly/web` was the checklist — every error it
  surfaced was a real leftover reference (never a false positive), and fixing
  all of them (down to zero) is what "done" means here.
- **`apps/web/components/board/badge-config.tsx` (the settings badge-toggle
  picker) needed no direct edit** — it derives its options purely from
  `BADGE_FIELDS` (already trimmed in Unit 3), so "Severity" disappeared from
  it automatically.
- **Test substitutions kept the *shape* of each test, not just made it
  compile.** Where a test used severity purely as "some configurable field
  with visible badge text" (e.g. badge-row.test.tsx's ordering test), it was
  swapped for `checklist` (also renders visible text, e.g. `"0/1"`) rather
  than deleted — the regression coverage for "config order drives render
  order" would otherwise have been lost.

## How to test / verify

- `pnpm --filter @boardly/web exec vitest run` — 181 tests, all green.
- `tsc --noEmit` and `eslint` clean on `@boardly/web`.
- Repo-wide grep for `[Ss]everity` across `apps/web` and
  `packages/sync/scripts` returns nothing.
- Manual (dark mode, demo account): the card-detail drawer's Properties
  section shows only Status/Priority/Due; the filter builder's field picker
  and the view's group-by picker no longer list "Severity"; the activity log
  never shows a "Severity" entry.

## Follow-ups / known gaps

- The demo account's kitchen-sink card still has its *old* markdown
  description text (literally containing "severity **S1**") until
  `SEED_RESET=1` is re-run — the seed script's *code* is fixed, but existing
  seeded content isn't regenerated automatically. Noted in the plan's
  Documentation/Operational Notes.
- Real-account leftover `severity` data (card fields, `badgeConfig`/filter/`groupBy`
  references, historical activity entries) is inert after this unit but not
  yet stripped — that's Unit 6.
