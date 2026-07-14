# UNIT 11.3: Card detail — Related directly above Labels + Delete right-aligned

- **Plan unit:** Unit 3 (`docs/plans/2026-07-14-002-feat-ui-docs-improvements-batch-plan.md`)
- **Status:** done
- **Requirements:** R3, R4
- **Commit(s):** _this commit_

## What changed

- `apps/web/components/card/card-detail.tsx`:
  - Swapped the `Checklist` and `Related` `<section>` blocks so the drawer order is now **Description → Properties → Links → Checklist → Related → Labels → Activity** (Related now sits directly above Labels).
  - Added `ml-auto` to the footer **Delete** button so it right-aligns; **Archive** stays left. No other footer change.
- `apps/web/components/card/card-detail.test.tsx`: added two tests — the exact section order, and that Delete carries `ml-auto`.

## Why (decisions)

- Related and Labels were separated by the Checklist section (order was …Links → Related → Checklist → Labels…). The requested target (chosen from the layout options) was to keep the flow but make the two adjacent with **Related on top** — achieved by moving Related down past Checklist rather than pulling Labels up, so the Checklist stays in its established position.
- **`ml-auto` on Delete, not `justify-between` on the row.** `ml-auto` pushes only Delete to the right and stays correct if more left-aligned footer actions are added later; it's the most surgical change to the existing `flex items-center gap-1` row. Separating the destructive Delete from the benign Archive also reduces mis-clicks.
- The delete-confirm `Dialog` and Delete's `onClick` are untouched — only the trigger button's horizontal position changed.

## How it works

- The sections are sibling `<section className="flex flex-col gap-2">` blocks in a single flex-column container; reordering is a pure DOM-order swap with no wrapper/conditional changes. The footer is a flex row; `ml-auto` on the last child consumes the free space before it, right-aligning Delete.

## Design (UI units)

- No new tokens; reuses the existing footer/section styling. Matches `DESIGN.md` card-drawer conventions (uppercase faint section headings; ghost footer actions; danger-colored Delete). Dark-mode: open a card → Related section renders immediately above Labels; the footer shows Archive at the left, Delete pushed to the right edge. (Prior section-order rationale: `docs/units/UNIT-P7-*`.)

## How to test / verify

- Unit tests (`apps/web/components/card/card-detail.test.tsx`): "orders the drawer sections with Related directly above Labels" asserts the full heading sequence; "right-aligns the Delete action in the footer" asserts `ml-auto`. Run: `pnpm exec vitest run apps/web/components/card/card-detail.test.tsx` (11 passing).
- `pnpm --filter @boardly/web typecheck` clean; eslint/prettier clean on the touched files.
- Existing delete/archive behavior tests still pass (Delete still opens the confirm dialog; cancel/confirm unchanged).

## Follow-ups / known gaps

- None.
