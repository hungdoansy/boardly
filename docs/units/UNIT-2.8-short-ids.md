# UNIT 2.8: Short card IDs (`BRD-###`)

- **Plan unit:** 2.8 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R8
- **Commit(s):** _this unit's commit_

## What changed

Every card already gets a stable short id on create (Unit 1.1); this unit adds **deterministic
repair-on-read** for duplicates caused by concurrent offline creation.

- `packages/domain/src/ids.ts` — `repairShortIds(cards): Map<cardId, newShortId>` (pure): for each
  colliding short id the earliest `(createdAt, id)` card keeps it and the rest are reassigned to
  fresh sequence numbers beyond the current max; global order is `(createdAt, id)`.
- `packages/sync/src/board-doc.ts` — `shortIdOverrides(doc)` computes the repair map over all cards;
  `getCard`, `cardsInColumn`, and `reclaimCards` apply it (read-only, no mutation).
- Tests: `packages/domain/src/ids.test.ts` (repair matrix) + `packages/sync/src/short-ids.test.ts`
  (sequential ids; merged-doc collision repaired + stable across replicas).

## Why (decisions)

- **Repair on read, not on write.** A write-side fix would trigger another CRDT update → re-merge
  churn and could ping-pong between replicas. Because the repair is a pure function of the card set
  and the order key `(createdAt, id)` is identical on every replica, each client independently
  computes the **same** ids at read time — no mutation, no coordination.
- **`(createdAt, id)` tie-break, not Yjs clientID.** `createdAt` + the card's stable uuid are both in
  the plain data and identical across replicas; the Yjs internal clientID isn't part of the domain
  model. This keeps the algorithm pure/testable and replica-stable (the plan's `(createdAt, clientID)`
  intent, realized with the stable id as the deterministic secondary key).
- **Reassign beyond `maxSeq`** so a repaired id never collides with an existing or another displaced
  id.
- **Accepted CRDT limitation, documented:** a shared counter can briefly collide offline; this repair
  makes the resolution deterministic rather than trying to prevent the collision.

## Design (UI units)

No new UI. Short ids already render on the card face (mono, tertiary) and in the detail header
(screenshotted in Units 1.5 / 2.x); repair only changes which string a duplicated card shows, and it
happens transparently on read.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/domain test` — `repairShortIds`: no-op without dupes; keeper = earliest,
  later reassigned to `max+1`; tie-break by id; **order-independent** (same result regardless of
  input order → stable across replicas).
- `pnpm --filter @boardly/sync test` — sequential `BRD-1`/`BRD-2`; **merged-doc collision**: two docs
  each create a card offline (both grab seq 1), after merge `getCard`/`cardsInColumn` show distinct
  ids (`BRD-1`/`BRD-2`), and both replicas agree.
- Full gates: typecheck 7/7, lint 7/7, test (domain 26 / sync 19 / commands 8 / ui 2 / web 56),
  `pnpm --filter @boardly/web build` valid, `format:check` clean.

## Follow-ups / known gaps

- Repair is O(cards) per selector call; fine at board scale. If it ever matters, memoize per
  doc-version.
- Hard GC / seq compaction after long-lived boards is out of scope (soft-delete keeps archived cards
  in the map; their ids remain reserved).
