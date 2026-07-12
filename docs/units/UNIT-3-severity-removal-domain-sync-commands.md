# UNIT 3: Remove `severity` — domain, sync, commands (and generated REST/MCP)

- **Plan unit:** 3 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R3
- **Commit(s):** `81b669b`

## What changed

- `packages/domain/src/enums.ts` — removed `Severity`, `SeverityValue`,
  `SeverityName`, `SEVERITY_NAMES`, `SEVERITY_META`.
- `packages/domain/src/types.ts` — removed `Card.severity`.
- `packages/domain/src/badges.ts` — removed `"severity"` from `BADGE_FIELDS`
  and `DEFAULT_BADGE_CONFIG`.
- `packages/domain/src/filters.ts` — removed `"severity"` from `FilterField`,
  the `matchesClause` case, `GroupByField`, and the `groupKeys`/`rankFor`/`groupLabel`
  cases. Added a fallback in **both** `groupKeys` (unrecognized field →
  returns `[""]`, the ungrouped lane) and `groupLabel` (unrecognized field →
  returns `"Ungrouped"`) — see Why below.
- `packages/domain/src/activity.ts` — removed `SeverityChangeActivity` and its
  entry in the `ActivityEntry` union.
- `packages/domain/src/io/snapshot.ts` — removed the `severity` zod field from
  `cardSchema`.
- `packages/domain/src/io/obsidian.ts` — removed the `severity: null` write.
- `packages/sync/src/schema.ts` — removed the `severity` Y.Map read in
  `cardToPlain`.
- `packages/sync/src/board-doc.ts` — removed `setCardSeverity`, the initial
  `card.set("severity", null)` on card creation, the `"severity"` activity
  replay case in `rowToActivity`, and the `yc.set("severity", card.severity)`
  snapshot-serialize line.
- `packages/commands/src/catalog.ts` — removed `setCardSeverity` from the
  registered command list (both the import and the array entry).
- `packages/commands/src/commands/card.ts` — removed the `setCardSeverity`
  command definition.
- `packages/commands/src/commands/view.ts` — removed `"severity"` from the
  `field`/`groupBy` zod enums.
- Tests updated: `packages/domain/src/filters.test.ts`, `packages/domain/src/io/io.test.ts`,
  `packages/sync/src/activity.test.ts`, `packages/sync/src/io.test.ts`.

## Why (decisions)

- **Mechanical, type-checker-guided removal.** Deleting `Severity`/`SeverityValue`
  from `enums.ts` and `severity` from `Card` made every remaining reference a
  compile error — the same approach the prior board-collapse plan
  (`docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md`)
  used for its large `boardId` removal. `tsc --noEmit` across
  `packages/domain`/`sync`/`commands` was clean before this unit was
  considered done.
- **No Drizzle migration.** `apps/server/src/db/schema.ts` never had a
  `severity` column — card fields live inside the Yjs CRDT doc, not SQL.
- **REST/MCP need no direct edit.** `apps/server/src/routes/commands.ts` and
  `apps/mcp/src/tools.ts` both generate their surfaces from
  `packages/commands/src/catalog.ts` generically, so `setCardSeverity`
  disappears from both simultaneously with the catalog removal (grep-verified
  post-change: no `severity` in either file).
- **The `groupKeys`/`groupLabel` fallback is new functionality, not just a
  deletion.** `matchesClause` already had `default: return true`, so a stale
  persisted filter clause referencing `"severity"` degrades safely on its
  own. `groupKeys`/`rankFor`/`groupLabel` had no such default — a legacy
  `groupBy: "severity"` would make `groupKeys` return `undefined`, and
  `for (const key of undefined)` in `groupCards` throws at runtime. Since
  `groupLabel` is also called directly by `apps/web/components/board/swimlanes.tsx`
  and `list-view.tsx` (not only through `groupCards`), it needed its own
  fallback — otherwise cards would land in the correct ungrouped lane but the
  lane's title would render `undefined`.

## How it works

`groupKeys`'s `default: return [""]` means any string that doesn't match a
known `GroupByField` case lands every card in the single `""` (ungrouped)
bucket — `groupCards`'s `for...of` never iterates `undefined`.
`groupLabel`'s two `default: return "Ungrouped"` arms (one per internal
switch — the `key === ""` special-case switch and the general resolve
switch) cover both call shapes: `groupLabel(unknownField, "")` from the
ungrouped lane, and a defensive `groupLabel(unknownField, someKey)` if ever
called directly with a non-empty key.

## How to test / verify

- `packages/domain/src/filters.test.ts` — new tests: a stale
  `{ field: "severity", ... }` clause matches every card (doesn't throw, uses
  the existing `default: true`); `groupCards(cards, "severity" as any)`
  resolves to one ungrouped lane instead of throwing; `groupLabel("severity" as any, "")`
  returns `"Ungrouped"`.
- `packages/domain/src/io/io.test.ts` — asserts a parsed card has no
  `severity` property at all (not even `null`).
- `packages/sync/src/activity.test.ts`, `packages/sync/src/io.test.ts` —
  updated to drop severity setup/assertions; remaining priority/status/due
  coverage stays green.
- Full check: `pnpm --filter @boardly/domain exec vitest run` (98 tests),
  `pnpm --filter @boardly/sync exec vitest run` (48 tests),
  `pnpm --filter @boardly/commands exec vitest run` (25 tests) — all green;
  `tsc --noEmit` clean across all three packages plus `@boardly/server` and
  `@boardly/mcp` (which import from them); `eslint` clean.

## Follow-ups / known gaps

- Existing persisted data (Yjs docs, saved views) may still contain
  `severity` keys/references — Unit 3 makes them inert/safe but doesn't
  strip them. Unit 6 does that (active cleanup, added after a review-time
  decision reversal — see the plan's Key Technical Decisions).
- `apps/web/components/card/activity.tsx` (a second, UI-layer activity
  renderer distinct from `packages/domain/src/activity.ts`) still had a
  `severity` case at this point — caught by document-review and fixed in
  Unit 4, not this unit.
