# UNIT 2.4: Due date field + relative/overdue display

- **Plan unit:** 2.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R6, R7
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.4-due-date-dark.png`

## What changed

Set a due date on a card; show a compact relative chip that turns amber near due and red when overdue.

- `packages/domain/src/dates.ts` — **pure** `describeDueDate(due, now)` → `{ label, tone }` and
  `formatDueDate(due)`. `now` is injected so labels/tones are deterministically testable.
- `packages/sync/src/board-doc.ts` — `setCardDueDate(doc, cardId, due | null, now)` stores the date
  as a nested `Y.Map { at, hasTime }` (never a JSON string), or clears it.
- `packages/commands/src/commands/card.ts` — `setCardDueDate` command (+ catalog) with a
  `{ at, hasTime } | null` zod input.
- `apps/web/components/card/due-date.tsx` — `DueChip` (tone-colored calendar chip) + `DueDatePicker`
  (Popover with a native date input, an "Include time" toggle + time input, and Clear).
- Wiring: `DueChip` on the card face (before the short id, when set); `DueDatePicker` in the card
  detail Properties (replaces the read-only Due row); `setDueDate` card action.
- Tests: `packages/domain/src/dates.test.ts` (the injected-`now` matrix) +
  `apps/web/components/card/due-date.test.tsx` (chip + picker).

## Why (decisions)

- **Pure `describeDueDate`, `now` injected.** All the date arithmetic (overdue vs soon vs normal,
  relative labels) is a pure domain function, unit-tested against a fixed `now` across
  today/tomorrow/2d/week/overdue and timed cases — the plan's core requirement. UI just picks colors
  from the returned `tone`.
- **Date-only vs timed semantics.** `hasTime=false` is "due that day" (overdue only once the day has
  passed); `hasTime=true` is overdue at its exact moment. The chip shows the time for a timed due
  today, otherwise a relative/short label.
- **Thresholds:** overdue → red (`--danger`); ≤ 2 days out → amber "soon" (`--warning`); else muted
  "normal". Labels: `Overdue` / `Today` (or time) / `Tomorrow` / `Nd` / `Jul 12`.
- **Structured storage** (`Y.Map{at,hasTime}`) per the Focalboard lesson — never a serialized string.
- **Native date/time inputs** (`[color-scheme:dark]`) keep the picker simple, accessible, and
  keyboard-friendly without a heavy calendar dependency.
- `now` in the on-face chip uses `Date.now()` at render (a real clock is correct there); tests inject
  `now` via a prop.

## Design (per DESIGN.md)

- Chip: `--radius-sm`, `text-xs`, calendar icon, tone color + ~16% fill (overdue/soon) or muted
  overlay (normal). Picker is a token-styled Popover; every control has an accent `focus-visible`
  ring. All tokens, one accent.
- Dark screenshot: `docs/units/screenshots/UNIT-2.4-due-date-dark.png` (red "Overdue" + amber "2d").

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/domain test` — `describeDueDate` across today/tomorrow/2d/week/overdue +
  timed today/overdue; `formatDueDate` date-only vs timed.
- `pnpm --filter @boardly/web test` (44) — `DueChip` label for a fixed `now`; `DueDatePicker` sets a
  date-only value, clears to null, and toggles `hasTime`.
- Full gates: typecheck 7/7, lint 7/7, test (domain 23 / sync 17 / commands 7 / ui 2 / web 44),
  `pnpm --filter @boardly/web build` valid, `format:check` clean. Playwright: set overdue + soon due
  dates → red/amber chips on the card face; dark screenshot vs DESIGN.md.

## Follow-ups / known gaps

- The due chip is a standalone meta-row item now; **Unit 2.6** folds it into the configurable badge
  row.
- The chip's `now` is captured at render (no live ticking); fine for a kanban — a periodic refresh
  could be added if long-open boards need it.
- Due-based sorting/filtering and reminders come with views (Phase 4) / desktop notifications
  (Unit 5.2).
