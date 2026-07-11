# UNIT F2: Focus mode — Zen density (collapse to title + status)

- **Plan unit:** F2 (`docs/plans/2026-07-11-001-feat-focus-mode-plan.md`)
- **Status:** done
- **Requirements:** R3 (Zen collapses to title + status marker), R5 (drawer full-color), R6 (both
  themes), R7 (repo rules)
- **Dependencies:** F1 (the focus store)
- **Commit(s):** _this unit's commit_

## What changed

At the **Zen** focus level, the board card face and the list row collapse to **title + a single
muted status marker** (+ the mono shortId); every other badge — priority, severity, due, labels,
links, checklist, assignee — is hidden. Off and Calm are unaffected. It reuses the existing badge
config; no new hiding mechanism.

- **`apps/web/components/board/column-cards.tsx`** — reads `useFocusMode()` once per column and
  passes an effective badge config to the cards: `level === "zen" ? ["status"] : config`. The card
  face (`CardFace`) renders `BadgeRow` with that config, so Zen shows only the status badge + shortId
  + title. (The card face has no colorful element outside `BadgeRow`, so `["status"]` fully
  collapses it.)
- **`apps/web/components/board/list-view.tsx`** — `ListView` reads `useFocusMode()` and passes
  `zen={level === "zen"}` into the pure `ListBody` → `ListRow`. In Zen the row drops its **entire
  trailing block** (the `BadgeRow` + assignee chip); the leading `StatusIcon` + mono shortId + title
  remain (terminal cards still strike through). `ListBody`/`ListRow` gained an optional `zen`
  prop (default false), keeping them pure and unit-testable.
- Tests: `apps/web/components/card/card.test.tsx` (+ board Zen test; `setFocusLevel` reset in
  `afterEach`), `apps/web/components/board/list-view.test.tsx` (+ two `ListBody` Zen tests),
  `apps/e2e/tests/focus-mode.spec.ts` (+ a Zen test that sets a due date so there's a queryable
  "Overdue" chip, then proves it's hidden on both surfaces in both themes + 4 committed baselines).

## Why

- **Reuse the badge config, don't invent hiding.** Zen is just the existing `config` path with an
  overridden value (`["status"]`) — the design's "reuse the badge-visibility concept." No CSS
  `:nth-child` hacks, and it's testable at the container level.
- **Read `useFocusMode()` once per container, not per card.** Toggling re-renders the card lists
  once; cards stay unsubscribed (perf — a column can hold hundreds of cards).
- **Board vs list differ slightly.** The board card face renders everything through `BadgeRow`, so
  `["status"]` collapses it. The list already renders the status as a *leading* icon, so Zen instead
  drops the *trailing* block (badges + assignee) — same outcome (title + status), different seam.
- **Muted marker for free.** The surviving status icon sits inside the `data-focus`-scoped region,
  so the Calm/Zen `saturate` from F1 mutes it too — a single quiet status dot.

## How to test / verify

Prereqs: Node 22.17.1; the e2e harness (Docker `boardly-db` up). No migrations (client-only).

- **Unit:** `pnpm --filter @boardly/web test` → **139 passed** (3 new): board — at Zen the severity
  badge (`S2`) is gone while the title remains, and present again at Off; list `ListBody` — trailing
  `S2` + label chip shown when `zen=false`, hidden when `zen=true` (shortId + title kept).
- **e2e:** `pnpm --filter @boardly/e2e e2e focus-mode` → green. The Zen test sets a past due date
  (→ "Overdue" chip), cycles to Zen, and asserts the chip is gone on the **board** and the **list**
  while the title stays; commits **4 baselines** — board & list Zen in **dark and light**
  (`focus-zen-{board,list}-{dark,light}-chromium-darwin.png`).
- **Gates:** `pnpm -r typecheck` / `-r lint` / `format:check` clean; `pnpm --filter @boardly/web
  build` compiles.
- **Manual (against `DESIGN.md`):** on the seeded demo board, Zen collapses the loud
  priority/severity/due/label badges to a single muted status marker + title per card, on both the
  board and the list, in both themes — verified by screenshot.

## Follow-ups / known gaps

- Zen hides the assignee chip in the list (part of "title + status only"); if avatars later become
  important at Zen, that's a deliberate reversal to revisit.
- `--focus-saturate` still mutes the surviving status marker at Zen (shared with Calm); if Zen ever
  wants a distinct intensity, split the token.
- This completes the Focus mode feature (F1 + F2); `DESIGN.md` updated with the appearance mode.
