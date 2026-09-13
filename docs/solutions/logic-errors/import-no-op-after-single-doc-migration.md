---
title: A create-once guard turned import into a silent no-op after the single-doc migration
date: 2026-09-04
problem_type: logic_error
module: packages/sync, packages/commands, packages/domain/src/io
severity: high
tags:
  [
    import-export,
    yjs,
    board-snapshot,
    single-per-user-doc,
    idempotency-guard,
    silent-failure,
    schema-drift,
  ]
---

Picking a file in the board's **Import board…** menu does nothing: no board changes, no error, the
popover just closes. It has been dead since the per-user single-doc work (Unit 6.2 / 7.1), and
nothing caught it because every test still passes.

**Root cause — a guard whose precondition was deleted underneath it.**
`buildBoardFromSnapshot` in `packages/sync/src/board-doc.ts` opens with
`if (meta.has("createdAt")) return;`. When it was written (Unit 4.4) import always targeted a
_freshly created_ board doc, so the guard only ever fired on an accidental double-build. After the
migration to one doc per user, `packages/commands/src/commands/io.ts` `importBoard` resolves the doc
via `ctx.getBoardDoc()` — the caller's _existing_ board, which always has `createdAt`. The guard now
fires on the first and only call. The command still returns a populated `Board` (read back from the
untouched doc), so the UI sees a success and shows nothing.

The general shape: **an idempotency guard encodes an assumption about the caller, not about itself.**
When the entity lifecycle changes from "created per operation" to "exists always", every
`if (already initialized) return;` in the write path silently inverts from safety net to kill switch.
Grep for `has("createdAt")`-style create-once guards whenever an entity's cardinality changes.

**Second-order drift in the same area.** `BoardSnapshot`
(`packages/domain/src/io/snapshot.ts`) was frozen at the Unit 4.4 schema and never grew with the
doc. It carries board meta, labels, and live cards only. The doc has since gained a top-level
`projects` map, `card.projectId`, saved views, archived cards, and board display prefs
(`showEmptyColumns`, `zoom`) — all of which `boardToSnapshot` drops. So the format documented and
labelled "full-fidelity JSON" is not, and a round-trip would lose project structure even once the
guard is removed. Fixing the no-op without bumping the snapshot version would ship a
data-losing Replace.

**Gotcha worth remembering:** the pure-domain snapshot module has no dependency on the Yjs schema by
design (that is the point of the io/ split), which means schema growth produces _no_ type error
here. Nothing mechanically links `packages/sync/src/schema.ts` gaining a section to
`packages/domain/src/io/snapshot.ts` needing a field. A round-trip test asserting
`doc → snapshot → doc` equality only covers the fields the snapshot already knows about, so it
cannot detect its own blind spot either.

---

**Resolved 2026-09-05 (UNIT-21 U4).** The guard is gone. The snapshot write path moved to
`packages/sync/src/io.ts` as `applySnapshot`, which takes an explicit mode (Replace / Merge / Add as
copy) and writes unconditionally; `buildBoardFromSnapshot` remains as a thin Replace-mode wrapper for
the existing call site. The snapshot drift described above was closed first, in U1 and U2 — v2 now
carries projects, `card.projectId`, saved views, archived cards and board display preferences, with a
declared-list drift guard (`packages/sync/src/schema-coverage.test.ts`) that fails when a new doc
section skips the export format.

The test that made the bug invisible is the one worth remembering: `packages/sync/src/io.test.ts`
carried **"is idempotent-guarded (won't overwrite an initialized doc)"**, which asserted the no-op
as if it were the feature. It was **replaced**, not supplemented, by a case that imports over a
seeded board and asserts the board changed. When a guard's precondition is deleted underneath it,
the test written to pin that guard becomes the thing defending the bug.
