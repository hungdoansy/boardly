# UNIT 2.6: Highlighted badge row (per-board config)

- **Plan unit:** 2.6 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R7
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.6-badge-row-dark.png`

## What changed

A compact, scannable badge row on the card face showing the board-configured fields in order; a
per-board setting controls which badges show and in what order.

- `packages/domain/src/badges.ts` — `BADGE_FIELDS` (the fields with a renderer today: priority,
  severity, dueDate, labels, checklist) + `DEFAULT_BADGE_CONFIG`.
- `packages/sync/src/board-doc.ts` — `initBoard` seeds `meta.badgeConfig` from
  `DEFAULT_BADGE_CONFIG`; new `setBadgeConfig(doc, config, now)`.
- `packages/commands/src/commands/board.ts` — `setBadgeConfig` command (+ catalog).
- `apps/web/lib/use-board.ts` — `useBadgeConfig(boardId)` (live, ordered) + `useSetBadgeConfig`.
- `apps/web/components/card/badge-row.tsx` — `BadgeRow`: renders the configured fields **in order**,
  emitting nothing for a field the card lacks (composes the 2.2–2.5 badge components).
- `apps/web/components/board/badge-config.tsx` — `BadgeConfig`: toggle fields on/off + reorder
  enabled ones (up/down); mounted in a **Badges** top-bar popover.
- `apps/web/components/card/card.tsx` — the card face's meta row is now a single `BadgeRow` +
  short id (the ad-hoc priority/severity/due/labels/checklist badges from 2.2–2.5 are unified here).
- Wiring: `config` flows from `useBadgeConfig` through `ColumnCards` / board-view → `SortableCard` →
  `CardFace` → `BadgeRow`.
- Test: `apps/web/components/card/badge-row.test.tsx`.

## Why (decisions)

- **Config is `string[]` field keys on `meta.badgeConfig`** — ordered, id-referenced, and the single
  source both the card face and the config UI read (an agent sets it via `setBadgeConfig`).
- **`BadgeRow` is presentation-only** (takes `card` + resolved `labels` + `config`); it composes the
  existing badge components, so there's no duplicate rendering logic and each field's "present?"
  rule lives in one place.
- **Absent fields emit nothing** (no empty placeholder) — the row stays calm and wraps to at most two
  lines (DESIGN §8).
- **`useBadgeConfig` uses an array `isEqual`** so the scoped `useY(boardMeta)` subscription only
  re-renders when the config actually changes.
- **Unifying the face badges here** (rather than leaving the 2.2–2.5 ad-hoc rows) is the point of the
  unit: one configurable row instead of five hard-coded ones.

## Design (per DESIGN.md)

- Single dense meta row, `gap 6px`, wraps; badges are the tokened components from 2.2–2.5; short id
  (mono, tertiary) trails. Config popover: token list with accent checkboxes + reorder chevrons,
  focus rings throughout. `links` (2.7) and `status` (2.12) join `BADGE_FIELDS` in their units.
- Dark screenshot: `docs/units/screenshots/UNIT-2.6-badge-row-dark.png` (card with priority/S2/Jan 15/
  0-1 checklist + the Badges config popover).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test` (51):

- `BadgeRow` renders **only** configured fields, **in configured order** (a set-but-unconfigured
  priority is not shown; severity precedes due).
- A configured field the card lacks → renders nothing (empty).
- Reordering the config reorders the badges.
- `BadgeConfig` toggling a field off removes it from `meta.badgeConfig`.
- Full gates: typecheck 7/7, lint 7/7, test (domain 23 / sync 17 / commands 8 / ui 2 / web 51),
  `pnpm --filter @boardly/web build` valid, `format:check` clean. Playwright: full badge row +
  config popover; dark screenshot vs DESIGN.md.

## Follow-ups / known gaps

- `links` (Unit 2.7) and `status` (Unit 2.12) add themselves to `BADGE_FIELDS` + `BadgeRow` when
  built.
- Config reorder is up/down buttons (consistent with the checklist); drag could be added later.
