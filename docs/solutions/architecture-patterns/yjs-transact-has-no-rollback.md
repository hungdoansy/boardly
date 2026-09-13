---
title: Yjs transactions batch updates but never roll back a throw
date: 2026-09-05
problem_type: architecture_pattern
module: packages/sync
severity: high
tags: [yjs, crdt, atomicity, transactions, rollback, import, destructive-operations]
---

Wrapping a multi-step mutation in `doc.transact()` does **not** make it atomic. The name invites
the database reading; Yjs does not provide it. From `yjs@13.6.31` (`dist/yjs.cjs`, `transact`):

```js
try {
  result = f(doc._transaction);
} finally {
  if (initialCall) {
    /* … */ cleanupTransactions(transactionCleanups, 0);
  }
}
```

There is no `catch`. Every write the callback made before it threw stays committed to the doc, and
the `finally` still runs cleanup — so the partial state also propagates to peers as an update. What
a transaction actually buys is **batching**: all the changes inside it ship as one update message,
so a peer device sees them land together rather than one at a time.

This matters for any operation that clears before it writes. A board import in Replace mode wipes
cards, projects and labels and then rebuilds from a snapshot; a throw between those two halves
leaves a wiped board with no undo — and there is no `UndoManager` anywhere in this repo
(verified: zero occurrences), so the confirmation dialog is the only guard.

**The pattern that does give atomicity:** stage the whole result in a detached `Y.Doc`, and only on
clean completion encode it and `Y.applyUpdate` it into the live doc inside one transaction. A throw
during staging discards the detached doc and never touches the board. The live document goes from
pre-state to post-state with nothing in between, which is also exactly what the batching guarantee
was already giving peers.

Two related facts worth keeping:

- `doc.transact` **is** re-entrant — a nested call joins the outer transaction — so wrapping a
  sequence of existing mutation helpers that each open their own transaction is safe and still
  produces a single update.
- To assert "nothing was written", compare `Y.encodeStateAsUpdate(doc)` before and after. Checking
  a few fields can pass while other structs were already mutated.

Caught while planning the import-modes work (`docs/plans/2026-09-04-1815-feat-board-import-modes-plan.md`),
where an earlier draft claimed a single `doc.transact` made import atomic and told the implementer
to write a test asserting a mid-apply throw leaves the doc unchanged — a test that cannot pass
against the real semantics.
