# UNIT 4.3: Activity / history log per card

- **Plan unit:** 4.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 4)
- **Status:** done
- **Requirements:** R8
- **Dependencies:** 2.1 (card detail panel) — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-4.3-activity-dark.png` (timeline in the detail panel)

## What changed

A per-card activity timeline, recorded on meaningful mutations and shown newest-first in the card
detail panel. Builds on the append-only `activity` Y.Array introduced in Unit 2.12 (which logged
status changes only).

- `packages/domain/src/activity.ts` — widened `ActivityEntry` from a single status entry to a
  discriminated union: `created`, `moved` (from/to column ids), `renamed` (to title), `status`,
  `priority`, `severity`, `due` (to ms or null), `archived`. Common base is `{id, cardId, at,
actor?}`. `ActivityType` exported.
- `packages/domain/src/dates.ts` — `formatRelativeTime(at, now)` pure helper ("now" / "5m" / "3h" /
  "2d" / absolute `Jul 12` / `Jul 12, 2025`), `now` injected for testability.
- `packages/sync/src/board-doc.ts`:
  - `appendActivity` now types its argument as a **distributive** `Omit<…, "id">` over the union so
    per-kind fields survive (a plain `Omit<Union,"id">` collapses to the shared keys).
  - `listActivity` reconstructs each entry per `type` (was hardcoded to `status`).
  - New `cardActivity(doc, cardId)` — one card's entries, **newest → oldest**.
  - Appends added to the mutations, each **only when the value actually changes** (no-op edits and
    pure within-column reordering log nothing): `addCard` → `created`; `moveCard` → `moved` (only on
    a column change); `setCardTitle` → `renamed`; `setCardPriority`/`setCardSeverity` → typed change;
    `setCardDueDate` → `due`; `archiveCard` → `archived`. Each gained an optional `actor` param.
- `packages/commands/src/commands/card.ts` — threads the actor (`ctx.userId ?? ctx.clientId`, and
  `createdBy: ctx.userId` for create) into those sync calls, so REST/MCP-driven changes are
  attributed identically to UI ones (agent-native parity).
- `apps/web`:
  - `lib/use-board.ts` — `useCardActivity(boardId, cardId)` (doc-level subscription, newest-first).
  - `components/card/activity.tsx` (new) — `CardActivity`: an icon + description + relative-time row
    per entry, resolving column ids to names for "moved" and enum values to display names. Renders
    the latest `PAGE = 30` with a "Show N older" affordance so a busy card can't blow up the DOM.
  - `components/card/card-detail.tsx` — an **Activity** section under Properties.

## Why

- **Append-only, reconstructed on read.** Entries are never rewritten, so the log merges cleanly
  under CRDT replication (verified by a replicate-and-merge test) and stays a faithful history.
  Storing the discriminant + only-changed fields keeps rows small.
- **Log at the sync layer, not the command layer.** Appending inside the same Yjs transaction as the
  mutation means the entry and the change are atomic and every writer (UI, REST, MCP, future
  automations) is logged uniformly — no way to mutate a card "silently".
- **Change-gated appends.** Logging only on a real change (and never for pure reordering) keeps the
  timeline signal-dense and avoids a wall of no-ops from, e.g., re-selecting the current priority.
- **Distributive `Omit`** was required once `ActivityEntry` became a union — TypeScript's plain
  `Omit<Union, K>` distributes over neither the union nor its variant-specific properties.

## How it works

- On a card mutation, the sync function captures the old value, writes the new one, and (if changed)
  `appendActivity`s a typed row to the board's `activity` Y.Array within the same transaction.
- `cardActivity(doc, cardId)` filters the reconstructed log to one card and reverses it
  (newest-first). `useCardActivity` re-derives it on any board-doc change (same pattern as
  `useCardById`).
- `CardActivity` maps each entry to an icon + sentence via a `describe()` switch, resolving column
  names from `useColumns` and enum labels from `STATUS_META`/`PRIORITY_META`/`SEVERITY_META`, and
  renders the relative time with `formatRelativeTime`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (sync):** `pnpm --filter @boardly/sync test` — `activity.test.ts`: created entry on add;
  move + priority + status append correctly-typed, newest-first; severity + due set/clear; **no-op
  changes and pure reordering log nothing**; archived entry + **append-only preserved across a
  replicate/merge**; per-card isolation. (34 sync tests pass; updated the 2.12 status tests to filter
  by type since create/move now also log.)
- **Unit (domain):** `pnpm --filter @boardly/domain test` — `formatRelativeTime` compact units +
  absolute fallback. 50 domain tests pass.
- **Unit (web):** `pnpm --filter @boardly/web test` — `activity.test.tsx`: "Created" entry shown;
  move + priority render newest-first with readable text. 99 web tests pass.
- **e2e (Playwright, dark, server + build):** created a card, set Priority=High, Status=In Progress,
  Severity=S2 → the detail panel's Activity section lists them newest-first over "Created", each with
  an icon and relative time (`UNIT-4.3-activity-dark.png`). Checked against `DESIGN.md`.
- **Gates:** `pnpm -r typecheck` (8/8), `pnpm --filter @boardly/web lint`, `pnpm --filter
@boardly/web build`, `pnpm format:check`, server tests (70, DB up) — all green.

## Follow-ups / known gaps

- **Actor display** is the raw user id / clientId (no user directory yet) — the UI currently omits
  it; wiring names in is a small follow-up once a directory exists.
- **Description edits** are not logged (they are character-level Y.Text merges; a "description
  edited" event would need debouncing to avoid per-keystroke noise).
- **No board-level activity view** yet — the log is whole-board in the doc, but only the per-card
  timeline is surfaced. A board feed can reuse `listActivity`.
- **Label assign/unassign** are not yet logged; easy to add alongside the existing appends.
