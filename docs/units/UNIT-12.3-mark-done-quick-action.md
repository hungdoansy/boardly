# UNIT 12.3: "Mark done" / "Mark not done" quick-action toggle

- **Plan unit:** Unit 12.3 (`docs/plans/2026-07-15-001-feat-context-menu-and-density-polish-plan.md`)
- **Status:** done
- **Requirements:** R1
- **Commit(s):** _this commit_

## What changed

- **`apps/web/components/card/card-context-menu.tsx`** — added a top-level `ContextMenuItem`
  immediately below **Open** (above the Status/Priority/Project submenus):
  - When the card is **not** done → label **"Mark done"**, sets status to `Status.Done`.
  - When the card **is** done → label **"Mark not done"**, sets status back to `Status.Todo`.
  - Leading glyph is the `StatusIcon` for the toggle _target_ (done disc / todo ring), tinted with
    that status's `STATUS_META` color — consistent with the Status submenu.
  - Label/target are **derived from `card.status`** each render via `isDoneStatus(card.status)` — no
    local state.
  - Imports: `isDoneStatus`, `Status` now come from the value import of `@boardly/domain`
    (`Status` moved off the type-only import since it's used as a value).
- **`docs/design/DESIGN.md` §8** — the card-face entry now notes the context menu's first action is
  the Mark done / Mark not done toggle.
- **`apps/web/components/card/card-context-menu.test.tsx`** — the "opens with expected items" test now
  asserts "Mark done" is present; two new tests cover the toggle in both directions.

## Why (decisions)

- **Toggle, not hide/always-show** (user choice): Done is the most common triage action and the
  inverse (reopening) is common enough to deserve the same one-click affordance. One item that flips
  is denser than two separate items.
- **"Mark not done" → `Todo`** (not the card's previous status). Todo is the canonical "active, not
  started" status, and the card keeps no memory of its prior column. Restoring the exact previous
  status would require tracking new state — deferred (see gaps).
- **Reuse the existing `setStatus` command**, not a new one — same code path an agent uses
  (agent-native parity), and it already appends the status activity entry / moves the card's column.
- **Derive during render** (rules-of-hooks / "derive, don't synchronize"): the label and target come
  straight from `card.status`, so a status change elsewhere is reflected with no effect/sync.

## How it works

- `const done = isDoneStatus(card.status)` (category `Completed`, i.e. `Status.Done`);
  `doneToggleTarget = done ? Status.Todo : Status.Done`. The item calls
  `actions.setStatus(card.id, doneToggleTarget)` on select and renders the target's `StatusIcon` +
  the matching label. Because a card's column **is** its status, this also visually moves the card.

## How to test / verify

- `apps/web/components/card/card-context-menu.test.tsx` (run: `pnpm --filter @boardly/web test`):
  - "opens with expected items" — "Mark done" is present.
  - non-done card → clicking "Mark done" sets `status === Status.Done`.
  - done card → shows "Mark not done" (not "Mark done"); clicking returns `status === Status.Todo`.
- Dark-mode visual: right-click a Todo card → "Mark done" with the filled done disc just under Open;
  right-click a Done card → "Mark not done" with the todo ring; clicking flips the card's column.

## Follow-ups / known gaps

- "Mark not done" always returns to **Todo**; restoring the card's _previous_ status (e.g. In
  Progress) would need prior-status tracking — a possible future enhancement, intentionally not built.
