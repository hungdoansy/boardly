# UNIT 2.3: Priority & severity fields + badges

- **Plan unit:** 2.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R6, R7
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.3-priority-severity-dark.png`

## What changed

Set priority and severity on a card; render their badges on the card face and edit them in the detail
panel. The `setCardPriority` / `setCardSeverity` commands already existed (Unit 1.7); this wires the
UI.

- `packages/domain/src/enums.ts` — `PRIORITY_META` (name + color per level) and `SEVERITY_META`
  (name + color per S#), the single source for the DESIGN §2 encodings.
- `apps/web/components/card/priority-badge.tsx` — `PriorityIcon` (Linear-style bar-height SVG;
  Urgent is a filled alert glyph) + `PriorityBadge` (accessible `Priority: <name>` label).
- `apps/web/components/card/severity-badge.tsx` — `SeverityBadge` (small solid color-coded `S#` pill).
- `apps/web/components/card/priority-select.tsx` / `severity-select.tsx` — token-styled Popover
  selects (radio semantics; severity includes a **None** option that clears to `null`). They control
  their own open state and close on pick.
- `apps/web/components/card/card.tsx` — the card face renders the priority icon (hidden when None) and
  severity pill (hidden when null) in the meta row before the short id.
- `apps/web/components/card/card-detail.tsx` — the Properties list now uses the interactive
  `PrioritySelect` / `SeveritySelect` (Status + Due remain read-only until 2.12 / 2.4).
- `apps/web/lib/use-board.ts` — `setPriority` / `setSeverity` card actions (via the command layer).
- Test: `apps/web/components/card/priority-severity.test.tsx`.

## Why (decisions)

- **Colors/labels live in domain (`*_META`)** so the card face, selects, and the future badge row
  (2.6) all read one source, and an agent/CLI can render the same names.
- **Custom SVG priority icon** rather than a lucide glyph — DESIGN calls for Linear-style bar-height
  icons, and a 3-bar SVG (Urgent = filled alert) is exact, dependency-free, and colorable via the
  meta color.
- **Severity `None` clears to `null`** (not a magic 0) — matches the domain model; the card face
  shows no severity pill when null (the plan's edge case).
- **Selects control their own open state and close on selection** — correct UX and avoids a
  reopen-toggle race (caught by the clear-to-null test).
- **Priority None / severity null are hidden on the face** to keep it calm (DESIGN: content-first);
  both are always editable in the detail panel.

## Design (per DESIGN.md)

- Priority: Urgent `#EB5757` (alert), High `#E2B341`, Medium `#4EA7FC`, Low `#8A8F98`, None faint —
  bar-height icon. Severity: S1 `#EB5757`, S2 `#F2994A`, S3 `#E2B341`, S4 `#6B6F76` — solid `S#`
  pill, `text-xs`. Selects are token-styled popovers with radio checks + accent focus rings.
- Dark screenshot: `docs/units/screenshots/UNIT-2.3-priority-severity-dark.png` (Urgent+S1 and
  Medium+S3 cards).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test` (40):

- `PriorityBadge` exposes the level name; `PrioritySelect` change → `onChange(Urgent)`.
- `SeverityBadge` renders `S2`; `SeveritySelect` sets a level and **clears to null**.
- (Card-face visibility of None/null is covered by the existing card tests — default cards show
  neither badge.)
- Full gates: typecheck 7/7, lint 7/7, test (domain 15 / sync 17 / commands 7 / ui 2 / web 40),
  `pnpm --filter @boardly/web build` valid, `format:check` clean. Playwright: set priority/severity
  via the detail selects → badges render on the card face; dark screenshot vs DESIGN.md.

## Follow-ups / known gaps

- Badges are a standalone meta row on the face for now; **Unit 2.6** folds priority/severity/due/
  labels/links into the per-board **configurable badge row**.
- **Deviation from the plan's "packages/ui badge variants":** priority/severity badges live in
  `apps/web/components/card/` (they need per-value domain colors + a custom icon), built on the ui
  `Popover`. The generic `Badge` primitive stays in `@boardly/ui`.
- Sort/filter by priority/severity comes with views (Phase 4).
