import { Priority } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  addColumn,
  archiveCard,
  archiveColumn,
  cardsInColumn,
  getBoard,
  getCard,
  initBoard,
  liveColumns,
  moveCard,
  reclaimCards,
  setCardDescription,
  setCardPriority,
} from "./board-doc";
import { boardCards } from "./schema";

const NOW = 1_700_000_000_000;

function setup() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Test board", now: NOW });
  const c1 = addColumn(doc, { title: "To Do", now: NOW, clientId: "1" });
  const c2 = addColumn(doc, { title: "Doing", now: NOW, clientId: "1" });
  const c3 = addColumn(doc, { title: "Done", now: NOW, clientId: "1" });
  return { doc, c1, c2, c3 };
}

function clone(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

function merge(a: Y.Doc, b: Y.Doc): void {
  const ua = Y.encodeStateAsUpdate(a);
  const ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
}

describe("board meta + creation", () => {
  it("initializes meta and default short-id prefix", () => {
    const { doc } = setup();
    const board = getBoard(doc, "board-1");
    expect(board.title).toBe("Test board");
    expect(board.shortIdPrefix).toBe("BRD");
    expect(board.shortIdSeq).toBe(0);
  });

  it("groups and sorts cards per column", () => {
    const { doc, c1, c2 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { columnId: c1, title: "B", now: NOW, clientId: "1" });
    addCard(doc, { columnId: c2, title: "C", now: NOW, clientId: "1" });

    expect(cardsInColumn(doc, c1).map((c) => c.id)).toEqual([a, b]);
    expect(cardsInColumn(doc, c2).map((c) => c.title)).toEqual(["C"]);
    expect(liveColumns(doc).map((c) => c.title)).toEqual(["To Do", "Doing", "Done"]);
  });

  it("assigns sequential short ids", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { columnId: c1, title: "B", now: NOW, clientId: "1" });
    expect(getCard(doc, a)?.shortId).toBe("BRD-1");
    expect(getCard(doc, b)?.shortId).toBe("BRD-2");
  });
});

describe("moveCard", () => {
  it("moves a card across columns (columnId + ord updated)", () => {
    const { doc, c1, c2 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    moveCard(doc, a, c2, {}, "1", NOW);
    expect(cardsInColumn(doc, c1).map((c) => c.id)).toEqual([]);
    expect(cardsInColumn(doc, c2).map((c) => c.id)).toEqual([a]);
    expect(getCard(doc, a)?.columnId).toBe(c2);
  });

  it("reorders within a column, placing strictly between neighbors", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { columnId: c1, title: "B", now: NOW, clientId: "1" });
    const c = addCard(doc, { columnId: c1, title: "C", now: NOW, clientId: "1" });
    // Move C between A and B → A, C, B
    moveCard(doc, c, c1, { afterId: a, beforeId: b }, "1", NOW);
    expect(cardsInColumn(doc, c1).map((x) => x.id)).toEqual([a, c, b]);
  });

  it("keeps repeated inserts into the same gap ordered", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { columnId: c1, title: "B", now: NOW, clientId: "1" });
    const x = addCard(doc, { columnId: c1, title: "X", now: NOW, clientId: "1" });
    const y = addCard(doc, { columnId: c1, title: "Y", now: NOW, clientId: "1" });
    moveCard(doc, x, c1, { afterId: a, beforeId: b }, "1", NOW);
    moveCard(doc, y, c1, { afterId: a, beforeId: x }, "1", NOW);
    expect(cardsInColumn(doc, c1).map((c) => c.id)).toEqual([a, y, x, b]);
  });

  it("computes a valid boundary ord at list start/end", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { columnId: c1, title: "B", now: NOW, clientId: "1" });
    // Move B to the very start (before A)
    moveCard(doc, b, c1, { afterId: null, beforeId: a }, "1", NOW);
    expect(cardsInColumn(doc, c1).map((c) => c.id)).toEqual([b, a]);
  });
});

describe("soft-delete", () => {
  it("archiving a card removes it from selectors but keeps it in the map", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    archiveCard(doc, a, NOW);
    expect(cardsInColumn(doc, c1)).toEqual([]);
    expect(boardCards(doc).has(a)).toBe(true);
    expect(getCard(doc, a)?.archived).toBe(true);
  });
});

describe("field setters", () => {
  it("sets a typed field and bumps updatedAt", () => {
    const { doc, c1 } = setup();
    const a = addCard(doc, { columnId: c1, title: "A", now: NOW, clientId: "1" });
    setCardPriority(doc, a, Priority.Urgent, NOW + 5);
    const card = getCard(doc, a);
    expect(card?.priority).toBe(Priority.Urgent);
    expect(card?.updatedAt).toBe(NOW + 5);
  });
});

describe("concurrency (merged docs)", () => {
  it("two docs moving the same card to different columns converge to exactly one", () => {
    const { doc, c1, c2, c3 } = setup();
    const card = addCard(doc, { columnId: c1, title: "X", now: NOW, clientId: "1" });
    const docB = clone(doc);

    moveCard(doc, card, c2, {}, "A", NOW);
    moveCard(docB, card, c3, {}, "B", NOW);
    merge(doc, docB);

    const colA = getCard(doc, card)?.columnId;
    const colB = getCard(docB, card)?.columnId;
    expect(colA).toBe(colB); // converged
    expect([c2, c3]).toContain(colA);

    // Present in exactly one column, never duplicated.
    const inC2 = cardsInColumn(doc, c2).filter((c) => c.id === card).length;
    const inC3 = cardsInColumn(doc, c3).filter((c) => c.id === card).length;
    expect(inC2 + inC3).toBe(1);
  });

  it("merges concurrent description edits at different positions (Y.Text)", () => {
    const { doc, c1 } = setup();
    const card = addCard(doc, { columnId: c1, title: "X", now: NOW, clientId: "1" });
    setCardDescription(doc, card, "hello", NOW);
    const docB = clone(doc); // both have "hello"

    setCardDescription(doc, card, "hello A", NOW); // append " A"
    setCardDescription(docB, card, "B hello", NOW); // prepend "B "
    merge(doc, docB);

    const desc = getCard(doc, card)?.description ?? "";
    expect(desc).toContain("A");
    expect(desc).toContain("B");
    expect(getCard(doc, card)?.description).toBe(getCard(docB, card)?.description);
  });

  it("column deleted in A while B adds a card to it → orphan surfaced by reclaim, not lost", () => {
    const { doc, c1 } = setup();
    const docB = clone(doc);

    archiveColumn(doc, c1, NOW);
    const orphan = addCard(docB, { columnId: c1, title: "orphan", now: NOW, clientId: "B" });
    merge(doc, docB);

    // Column is gone from the live set on both replicas.
    expect(liveColumns(doc).some((c) => c.id === c1)).toBe(false);
    expect(liveColumns(docB).some((c) => c.id === c1)).toBe(false);

    // The added card is not lost, not duplicated, surfaced by reclaim.
    const reclaim = reclaimCards(doc);
    expect(reclaim.filter((c) => c.id === orphan)).toHaveLength(1);
    for (const col of liveColumns(doc)) {
      expect(cardsInColumn(doc, col.id).map((c) => c.id)).not.toContain(orphan);
    }

    // Both replicas converge on the card's column.
    expect(getCard(doc, orphan)?.columnId).toBe(getCard(docB, orphan)?.columnId);
  });
});
