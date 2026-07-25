# UNIT-14.1 — Archived-cards sync: list selector, restore mutation, `unarchived` activity

Part of the Archive view batch (`docs/plans/2026-07-24-001-feat-archived-cards-view-plan.md`, Unit 1).

## What changed

The sync/domain layer can now **list** archived cards and **restore** one — the data foundation for
the Archive view. Previously a card could be archived (`archiveCard`) but nothing could enumerate
archived cards or bring one back.

- **Domain** (`packages/domain/src/activity.ts`): new `UnarchivedActivity` (`type: "unarchived"`)
  added to the `ActivityEntry` union — the inverse of the existing `ArchivedActivity`.
- **Sync** (`packages/sync/src/board-doc.ts`):
  - `listArchivedCards(doc)` — every card with `archived === true`, number-repaired via the same
    `toPlain` path as `allLiveCards`, sorted by `deletedAt` **descending** (most recently archived
    first). Complement of `allLiveCards`.
  - `unarchiveCard(doc, cardId, now, actor?)` — inverse of `archiveCard`: sets `archived` false,
    **deletes** the `deletedAt` key, and logs an `unarchived` activity entry. No-op if the card is
    not archived (or the id is unknown).
  - `rowToActivity` gains a `case "unarchived"` so the stored entry reconstructs into a typed
    `UnarchivedActivity`.

Both new functions are re-exported automatically via `export * from "./board-doc"` in the package
index, so `@boardly/sync` consumers (commands, web) import them directly.

## Why

- Archiving was always designed to keep the card in the doc "for a future archive view" (the comment
  at `board-doc.ts` on `deleteCard`). This unit builds the read + restore half of that promise.
- **Restore clears `deletedAt` (delete, not zero):** `cardToPlain` only sets `deletedAt` when the
  stored value is a `number` (`schema.ts`), so deleting the key is the clean way to make the restored
  card's `deletedAt` read back as `undefined`. It also keeps the archive sort key honest — a restored
  card carries no stale timestamp if it is later re-archived.
- **Restore needs no status remap:** `archiveCard` never touches `status`, so on restore the card
  simply reappears in the status column it still holds. Mirrors `unarchiveProject`'s
  flip-a-flag-only approach.
- **New activity kind, not silent:** logging `unarchived` keeps the timeline symmetric with
  `archived` and auditable. Adding a union member is cheap and TypeScript-enforced everywhere the
  union is switched.

## How it works

`listArchivedCards` filters `boardCards(doc).values()` to archived `Y.Map`s, maps through `toPlain`
(prefix + repaired ticket number), and sorts by `deletedAt` desc (`(b.deletedAt ?? 0) - (a.deletedAt
?? 0)`). `unarchiveCard` runs inside the shared `withCard` transaction (which also bumps
`updatedAt`), guards on the current `archived` flag to stay idempotent, and appends the activity
entry within the same transaction (CRDT-safe, append-only).

## How to test / verify

- **Unit tests (green):** `packages/sync/src/board-doc.test.ts`
  - `listArchivedCards`: returns only archived cards, most-recently-archived first; empty when none;
    live cards absent (and present in `allLiveCards`).
  - `unarchiveCard (restore)`: returns the card to its status column and clears the `archived` flag +
    `deletedAt`; logs a newest-first `unarchived` activity entry with the actor; no-ops on a live card
    and an unknown id (no spurious activity); archive→restore round-trip preserves title/status/priority.
- **Run:** `pnpm --filter @boardly/sync test` → 70 passed. Typecheck clean (the union change compiles
  against every `ActivityEntry` switch).

## Follow-ups / known gaps

- Orphaned activity-log entries for hard-deleted cards remain (pre-existing, unrelated).
- No behavioral change to `archiveCard`, `deleteCard`, or the live selectors' `!archived` filter.
