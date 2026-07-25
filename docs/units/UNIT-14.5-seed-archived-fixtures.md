# UNIT-14.5 — Seed archived fixtures

Part of the Archive view batch (`docs/plans/2026-07-24-001-feat-archived-cards-view-plan.md`, Unit 5).

## What changed

- **Seed** (`packages/sync/scripts/seed-demo-board.ts`): a new `ARCHIVED_CARDS` set (3 `CardSpec`s)
  created then archived via `archiveCard` at the end of `buildBoard`, so the demo account's Archive
  view is populated. They are kept separate from `CARDS` so the live board showcase is unaffected,
  and archived in order with the seed's advancing `tick()` clock, so they list
  most-recently-archived first — exactly as the Archive view renders (`deletedAt` desc).

## Why

- Without fixtures the Archive view would look empty in the demo account, so the feature isn't
  demonstrable after a seed. Routing through the real `archiveCard` accessor (not hand-set fields)
  keeps the seeded state faithful — the cards carry `archived`/`deletedAt` and an `archived`
  activity entry exactly like a user action would.

## How to test / verify

- **Test expectation: none** — fixture data, no behavioral change.
- **Manual:** run the seed with `SEED_RESET=1` against a running stack, open the demo account, click
  **Archive** in the sidebar → the three seeded cards appear newest-first; Restore returns one to
  its status column on the board.
- Typecheck/lint green (the script is in `@boardly/sync`'s module graph).

## Follow-ups / known gaps

- None. Archived-card count is intentionally small (3) to demonstrate the view without noise.
