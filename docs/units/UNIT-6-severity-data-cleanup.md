# UNIT 6: Actively purge persisted `severity` data from the real account

- **Plan unit:** 6 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R3
- **Commit(s):** _this unit's commit_

## What changed

- Created `packages/sync/scripts/cleanup-severity.ts` — a one-off
  maintenance script (not part of the app or CI) that connects to a single
  account's live board doc and strips:
  1. the `severity` key from every card's Y.Map,
  2. `"severity"` from the board's `badgeConfig` array,
  3. any saved view's filter clause with `field: "severity"` — recursively,
     through nested AND/OR groups — and clears `groupBy` to `null` if it was
     `"severity"`,
  4. activity-log entries with `type: "severity"`.

## Why (decisions)

- **Scope addition made during document-review, not the original plan
  draft.** The plan first treated old `severity` data as safe to leave inert
  (the project's prior precedent for structural collapses). Asked during
  review whether stale saved views needed a UI cue, the user's answer —
  "Remove them completely. From the code. Like it never existed." — reversed
  that decision. This unit is the result.
- **No default account.** Unlike `seed-demo-board.ts`/`add-brand-showcase-card.ts`
  (which default to `demo@boardly.app`), this script requires
  `CLEANUP_EMAIL`/`CLEANUP_PASSWORD` with no fallback and exits immediately if
  either is missing — it's meant for the real personal account, and
  defaulting to anything risks running against the wrong doc.
- **Raw Yjs primitives, not typed accessors.** By the time this runs (after
  Units 3-5), the typed `setCardSeverity` and friends no longer exist —
  `card.delete("severity")` and plain-array rewrites work directly against
  the CRDT without needing removed types.
- **Narrow, single-purpose mutations, not a bulk rewrite.** Each step deletes
  one known key or filters one known string, rather than reconstructing
  broader structures — smaller blast radius for a script that touches a real
  account's live data, sequenced last (after Units 3-5 are verified green).
- **Idempotent by construction.** Every step is a no-op on already-clean
  data, so a partial or interrupted run can simply be re-run.

## How it works

Auth (HTTP login → JWT/userId) and connect (Hocuspocus WebSocket to
`board:{userId}` via a one-time ticket) follow the exact pattern
`seed-demo-board.ts`/`add-brand-showcase-card.ts` already use. Once synced:
cards and badge config are cleaned inside one `doc.transact()`; saved views
are rewritten one at a time via the existing `saveView` accessor (which is
its own transaction); the activity log is cleaned in a final `doc.transact()`,
iterating from the highest index down so earlier deletions don't shift
indices still to be checked. The script logs a count for each category and
exits.

## How to test / verify

This is an operational script, not app code covered by the automated
suites — verified by actually running it:

- Ran against the demo account (`demo@boardly.app`) before this unit's
  reseed: removed a stale `severity` key from **16 cards**, cleaned the
  badge config, and removed **5** stale activity entries (0 saved views
  needed rewriting — the seed never created one referencing severity).
- Ran a second time immediately after: all counts `0` / "already clean" —
  confirms idempotency.
- Loaded the app in the browser after both runs — board rendered
  identically, no errors, `document.body.innerHTML` contained no
  `"severity"` substring.
- `tsc --noEmit` (via the same loose per-file invocation used for the other
  `packages/sync/scripts/*.ts` files, since scripts aren't in the package's
  own `tsconfig.json` `include`) and `eslint` clean.

## Follow-ups / known gaps

- This script must be run once, manually, against the real personal account
  after Units 3-5 are deployed — it's an operational step, not something CI
  runs. Documented in the plan's Documentation/Operational Notes.
- Does not touch card *description* markdown text that happens to mention
  "severity" in prose (e.g. a card someone wrote describing severity
  levels) — only the structured data paths listed above. Scoped
  deliberately; rewriting free-text content wasn't part of the request.
