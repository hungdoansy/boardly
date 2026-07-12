import { Priority, Severity, Status } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  archiveCard,
  cardActivity,
  initBoard,
  listActivity,
  moveCard,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  setCardStatus,
  setCardTitle,
} from "./board-doc";

const NOW = 1_700_000_000_000;

function setup() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Test board", now: NOW });
  return { doc };
}

describe("card activity log", () => {
  it("records a 'created' entry when a card is added", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1", createdBy: "u1" });
    const log = cardActivity(doc, a);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: "created", cardId: a, actor: "u1" });
  });

  it("logs a status change for a move to a different status, plus priority", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    // Drag to a new column = a status change.
    moveCard(doc, a, Status.InProgress, { afterId: null, beforeId: null }, "1", NOW + 1, "u1");
    setCardPriority(doc, a, Priority.High, NOW + 2, "u1");

    // Newest-first for the card timeline.
    const log = cardActivity(doc, a);
    expect(log.map((e) => e.type)).toEqual(["priority", "status", "created"]);
    expect(log[1]).toMatchObject({ type: "status", from: Status.Todo, to: Status.InProgress });
    expect(log[0]).toMatchObject({ type: "priority", from: Priority.None, to: Priority.High });
  });

  it("logs severity and due-date changes, and clearing them", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    setCardSeverity(doc, a, Severity.S1, NOW + 1, "u1");
    setCardDueDate(doc, a, { at: NOW + 100, hasTime: false }, NOW + 2, "u1");
    setCardDueDate(doc, a, null, NOW + 3, "u1");

    const types = cardActivity(doc, a).map((e) => e.type);
    expect(types).toEqual(["due", "due", "severity", "created"]);
    const dues = cardActivity(doc, a).filter((e) => e.type === "due");
    expect(dues[0]).toMatchObject({ to: null }); // cleared (newest)
    expect(dues[1]).toMatchObject({ to: NOW + 100 });
  });

  it("does not log a no-op change (same value)", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    setCardPriority(doc, a, Priority.None, NOW + 1, "u1"); // unchanged
    setCardTitle(doc, a, "A", NOW + 2, "u1"); // unchanged
    setCardStatus(doc, a, Status.Todo, NOW + 3, "u1"); // unchanged
    expect(cardActivity(doc, a).map((e) => e.type)).toEqual(["created"]);
  });

  it("does not log pure reordering within the same status", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: Status.Todo, title: "B", now: NOW, clientId: "1" });
    moveCard(doc, b, Status.Todo, { afterId: a, beforeId: null }, "1", NOW + 1, "u1");
    expect(cardActivity(doc, b).filter((e) => e.type === "status")).toHaveLength(0);
  });

  it("logs an 'archived' entry and is append-only across a merge", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    setCardTitle(doc, a, "Renamed", NOW + 1, "u1");
    archiveCard(doc, a, NOW + 2, "u1");

    // Replicate into a second doc and merge back: the log must be preserved
    // append-only (no rewrites, no loss).
    const before = listActivity(doc).map((e) => e.id);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(copy));
    const after = listActivity(doc).map((e) => e.id);
    expect(after).toEqual(before);
    expect(cardActivity(doc, a).map((e) => e.type)).toEqual(["archived", "renamed", "created"]);
  });

  it("cardActivity isolates one card from another", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: Status.Todo, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: Status.Todo, title: "B", now: NOW, clientId: "1" });
    setCardPriority(doc, b, Priority.Urgent, NOW + 1, "u1");
    expect(cardActivity(doc, a).map((e) => e.type)).toEqual(["created"]);
    expect(cardActivity(doc, b).map((e) => e.type)).toEqual(["priority", "created"]);
  });
});
