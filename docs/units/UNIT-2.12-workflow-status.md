# UNIT 2.12: Workflow status field

- **Plan unit:** 2.12 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R14
- **Dependencies:** 2.1 (card detail), 2.6 (badge config), 1.7 (status enum scaffold) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Every card now has a first-class **workflow status**, independent of its column: settable from the
UI, shown as a badge, and logged to a board activity feed.

- `packages/domain/src/status.ts` — added `StatusCategory` (unstarted/started/completed/canceled),
  `STATUS_META` (name + category + color per status), `STATUS_ORDER`, and
  `isDoneStatus`/`isCanceledStatus`/`isTerminalStatus`. (The enum + `DEFAULT_STATUS = Todo` existed
  from Unit 1.7.)
- `packages/domain/src/activity.ts` — new. `ActivityEntry` (currently `StatusChangeActivity`;
  widened in U4.3).
- `packages/domain/src/badges.ts` — `status` added to `BADGE_FIELDS` and `DEFAULT_BADGE_CONFIG`
  (first), so the badge-config UI exposes it and new boards show it by default.
- `packages/sync` — `boardActivity(doc)` append-only `Y.Array`; `appendActivity` + `listActivity`;
  `setCardStatus(doc, cardId, status, now, actor?)` now, **only when the value changes**, writes the
  status and appends a `{type:"status", cardId, from, to, at, actor}` entry in the same transaction.
- `packages/commands/src/commands/status.ts` — `setCardStatus` command's zod enum is derived from
  `STATUS_VALUES` (can't drift), and it forwards `ctx.clientId` as the activity actor. (Already
  registered in the catalog since 1.7.)
- `packages/ui/src/components/status-icon.tsx` — new `StatusIcon`: a self-contained, Linear-style
  SVG glyph (outline ring for unstarted, progress pie for started, filled disc + check / cross for
  done / canceled), colored via a `color` prop. Domain-free primitive.
- `apps/web/components/card/status-badge.tsx` + `status-select.tsx` — the badge (maps
  `STATUS_META` → `StatusIcon`) and the popover picker; the picker routes through
  `useCardActions().setStatus` → the command layer.
- `apps/web/components/card/badge-row.tsx` — renders the status glyph when `status` is configured.
- `apps/web/components/card/card.tsx` — done/canceled cards render their title struck-through and
  dimmed (`isTerminalStatus`).
- `apps/web/components/card/card-detail.tsx` — the Properties list now has a real **Status** control
  (replacing the "arrives in Unit 2.12" placeholder).
- `apps/web/lib/use-board.ts` — `setStatus` added to `useCardActions`.
- Tests: `packages/domain/src/status.test.ts`, `packages/sync/src/board-doc.test.ts` (status +
  activity + column independence), `apps/web/components/card/status-select.test.tsx`.

## Why (decisions)

- **Status is a plain LWW key, not tied to `columnId`.** Setting status never moves the card, and
  moving the card never changes status (verified in sync + UI tests). This is the plan's core
  invariant (R14) and mirrors Linear, where workflow state and board position are orthogonal.
- **Activity is appended only on an actual change, inside the status transaction.** No-op sets add
  no noise, and the log entry can never desync from the write (same Yjs transaction). The activity
  log is introduced minimally here (status only); **Unit 4.3** widens the event set and adds the UI —
  `ActivityEntry` is already a discriminated union to make that additive.
- **`StatusIcon` lives in `packages/ui` (domain-free), colors come from the domain.** The glyph is a
  reusable primitive (status lanes in U4.2, group headers, etc.), so it takes a `variant` + `color`
  rather than importing `@boardly/domain` into the UI package. This is the plan's "status badge in
  packages/ui", with the domain still owning the palette (the app-side `StatusBadge` bridges them).
  Sibling badges (priority/severity) stay in `apps/web` for consistency.
- **Zod enum derived from `STATUS_VALUES`.** The agent/REST surface (U3.9/3.10) can't drift from the
  domain enum.
- **Done/Canceled dim + strike the card face** (plan's optional styling) via `isTerminalStatus`, so a
  completed board reads at a glance.

## Design (UI)

Matches `docs/design/DESIGN.md` (dark-first). Status glyphs: Backlog = dashed ring, Todo = open ring,
In Progress = amber half-pie, In Review = green pie, Done = filled indigo disc + check, Canceled =
gray disc + cross. Picker is the standard popover menu (radio rows, check on the current). Screenshots:
`docs/units/screenshots/UNIT-2.12-status-board-dark.png` (badges across a board; the Done card struck
through) and `UNIT-2.12-status-select-dark.png` (picker open in the detail sheet).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/domain test` — `status.test.ts`: default is Todo; every value has valid
  metadata + hex color; `STATUS_ORDER` covers each status once; terminal-status classification.
- `pnpm --filter @boardly/sync test` — `setCardStatus` writes status **and** logs a typed activity
  entry (`from`/`to`/`actor`); a no-op set logs nothing; moving a card leaves status untouched and
  adds no status activity.
- `pnpm --filter @boardly/web test` — `status-select.test.tsx`: badge exposes the name; picker
  changes value; and (integration through the command layer) selecting a status changes
  `card.status`, appends activity, and leaves `columnId` unchanged.
- Full gates: `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`
  (domain 30 / sync 23 / commands 7 / ui 2 / web 82), `pnpm --filter @boardly/web build`,
  `pnpm format:check` — all green.
- **Live (Playwright MCP, dark):** created a board + 4 cards (all default Todo, all in one column),
  set them to Backlog / In Progress / In Review / Done via the detail picker; the board shows four
  distinct status glyphs, the Done card is struck through, and every card stayed in the same column
  (status ⟂ column).

## Follow-ups / known gaps

- **Group-by status (U4.2), filter by status (U4.1), and a status command-palette action (U2.9)** —
  the field, badge, command, and MCP/REST exposure are done; those consumers arrive in their units.
- **Activity feed UI (U4.3)** — this unit logs status changes; the history panel and additional
  event kinds (create/move/label/…) come later. `ActivityEntry` is a union ready to widen.
- **Status in the card-face badge row is always shown when configured** (every card has a status).
  If that reads busy on dense boards, a "hide Todo" option could be added to badge-config.
