import { Status } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { addCard, cardsInStatus, getCard, initBoard } from "./board-doc";

const NOW = 1_700_000_000_000;

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

describe("short ids", () => {
  it("assigns sequential ids on create (shown as #{number} with the empty default prefix)", () => {
    const doc = new Y.Doc();
    initBoard(doc, { title: "Board", now: NOW });
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: Status.Todo, title: "B", now: NOW, clientId: "1" });
    expect(getCard(doc, a)?.shortId).toBe("#1");
    expect(getCard(doc, b)?.shortId).toBe("#2");
  });

  it("repairs a merged number collision deterministically (stable across replicas)", () => {
    const docA = new Y.Doc();
    initBoard(docA, { title: "Board", now: NOW });
    const docB = clone(docA); // both share the empty card set (seq 0)

    // Two offline creates independently grab seq 1 → both stored as number 1.
    addCard(docA, { id: "cardA", status: Status.Todo, title: "A", now: NOW, clientId: "a" });
    addCard(docB, { id: "cardB", status: Status.Todo, title: "B", now: NOW, clientId: "b" });
    merge(docA, docB);

    const a = getCard(docA, "cardA")?.shortId;
    const b = getCard(docA, "cardB")?.shortId;
    // Distinct after repair; earliest (createdAt, id) keeps #1.
    expect(a).toBe("#1");
    expect(b).toBe("#2");

    // Both replicas agree.
    expect(getCard(docB, "cardA")?.shortId).toBe(a);
    expect(getCard(docB, "cardB")?.shortId).toBe(b);

    // Selector output has no duplicate ids.
    const ids = cardsInStatus(docA, Status.Todo).map((c) => c.shortId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
