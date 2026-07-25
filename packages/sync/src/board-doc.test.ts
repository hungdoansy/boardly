import { DEFAULT_BADGE_CONFIG, DEFAULT_STATUS, Priority, Status } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  addLink,
  addRelation,
  allLiveCards,
  archiveCard,
  boardToSnapshot,
  buildBoardFromSnapshot,
  cardsInStatus,
  deleteCard,
  getBoard,
  getCard,
  initBoard,
  listActivity,
  moveCard,
  moveLink,
  removeRelation,
  setCardDescription,
  setCardPriority,
  setCardStatus,
  setShowEmptyColumns,
  setZoom,
} from "./board-doc";
import { boardCards, boardMeta } from "./schema";

const NOW = 1_700_000_000_000;

// Fixed status columns replace user-managed columns (Unit 7).
const TODO = Status.Todo;
const DOING = Status.InProgress;
const DONE = Status.Done;

function setup() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Test board", now: NOW });
  return { doc };
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
  it("initializes meta with an empty default prefix; Board.id is the user id", () => {
    const { doc } = setup();
    const board = getBoard(doc, "u1");
    expect(board.id).toBe("u1");
    expect(board.title).toBe("Test board");
    expect(board.shortIdPrefix).toBe("");
    expect(board.shortIdSeq).toBe(0);
  });

  it("a brand-new (uninitialized) per-user doc reports no cards", () => {
    const doc = new Y.Doc();
    expect(allLiveCards(doc)).toEqual([]);
    for (const status of [TODO, DOING, DONE]) {
      expect(cardsInStatus(doc, status)).toEqual([]);
    }
  });

  it("groups and sorts cards by status", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addCard(doc, { status: DOING, title: "C", now: NOW, clientId: "1" });

    expect(cardsInStatus(doc, TODO).map((c) => c.id)).toEqual([a, b]);
    expect(cardsInStatus(doc, DOING).map((c) => c.title)).toEqual(["C"]);
    expect(cardsInStatus(doc, DONE)).toEqual([]);
  });

  it("defaults a card with no explicit status to Todo", () => {
    const { doc } = setup();
    const a = addCard(doc, { title: "A", now: NOW, clientId: "1" });
    expect(getCard(doc, a)?.status).toBe(DEFAULT_STATUS);
    expect(cardsInStatus(doc, DEFAULT_STATUS).map((c) => c.id)).toEqual([a]);
  });

  it("assigns sequential integer numbers, shown as #{number} with an empty prefix", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    expect(getCard(doc, a)?.number).toBe(1);
    expect(getCard(doc, b)?.number).toBe(2);
    expect(getCard(doc, a)?.shortId).toBe("#1");
    expect(getCard(doc, b)?.shortId).toBe("#2");
  });

  it("derives {PREFIX}-{number} when the board has a prefix", () => {
    const doc = new Y.Doc();
    initBoard(doc, { title: "Prefixed", shortIdPrefix: "TEC", now: NOW });
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    expect(getCard(doc, a)?.number).toBe(1);
    expect(getCard(doc, a)?.shortId).toBe("TEC-1");
  });

  it("repairs duplicate numbers from concurrent creation on read (no write)", () => {
    const { doc } = setup();
    const first = addCard(doc, { status: TODO, title: "First", now: NOW, clientId: "1" });
    // Simulate a merged offline sibling that grabbed the same number.
    const dupId = "dup-card";
    const dup = new Y.Map<unknown>();
    dup.set("id", dupId);
    dup.set("number", getCard(doc, first)!.number);
    dup.set("title", "Dup");
    dup.set("status", TODO);
    dup.set("ord", "a1");
    dup.set("archived", false);
    dup.set("createdAt", NOW + 1000); // later → the displaced one
    boardCards(doc).set(dupId, dup);

    // Earliest (createdAt, id) keeps number 1; the later card is reassigned to 2.
    expect(getCard(doc, first)?.number).toBe(1);
    expect(getCard(doc, dupId)?.number).toBe(2);
    expect(getCard(doc, dupId)?.shortId).toBe("#2");
  });
});

describe("showEmptyColumns board meta", () => {
  it("defaults to true and round-trips a false write", () => {
    const { doc } = setup();
    expect(getBoard(doc, "u1").showEmptyColumns).toBe(true);
    setShowEmptyColumns(doc, false, NOW + 1);
    expect(getBoard(doc, "u1").showEmptyColumns).toBe(false);
    setShowEmptyColumns(doc, true, NOW + 2);
    expect(getBoard(doc, "u1").showEmptyColumns).toBe(true);
  });

  it("defaults to true even on a brand-new (uninitialized) doc", () => {
    const doc = new Y.Doc();
    expect(getBoard(doc, "u1").showEmptyColumns).toBe(true);
  });
});

describe("zoom board meta", () => {
  it("defaults to 1 and round-trips a write", () => {
    const { doc } = setup();
    expect(getBoard(doc, "u1").zoom).toBe(1);
    setZoom(doc, 1.25, NOW + 1);
    expect(getBoard(doc, "u1").zoom).toBe(1.25);
    expect(boardMeta(doc).get("updatedAt")).toBe(NOW + 1);
  });

  it("clamps an out-of-range factor at write time", () => {
    const { doc } = setup();
    setZoom(doc, 99, NOW + 1);
    expect(getBoard(doc, "u1").zoom).toBe(2);
    setZoom(doc, 0.01, NOW + 2);
    expect(getBoard(doc, "u1").zoom).toBe(0.5);
  });

  it("clamps defensively on read (stale/out-of-range persisted value)", () => {
    const { doc } = setup();
    // Simulate a value written by an older/other client bypassing the setter.
    boardMeta(doc).set("zoom", 42);
    expect(getBoard(doc, "u1").zoom).toBe(2);
  });

  it("defaults to 1 on a brand-new (uninitialized) doc", () => {
    const doc = new Y.Doc();
    expect(getBoard(doc, "u1").zoom).toBe(1);
  });
});

describe("badgeConfig read-time default", () => {
  // Regression: the client no longer WRITES default board meta (it clobbered a
  // synced board's real config on a fresh device via last-writer-wins). So an
  // absent badge config must default at READ time, while an explicit [] (the
  // user cleared every badge) is preserved.
  it("defaults an absent badge config to DEFAULT_BADGE_CONFIG", () => {
    const doc = new Y.Doc();
    expect(getBoard(doc, "u1").badgeConfig).toEqual(DEFAULT_BADGE_CONFIG);
  });

  it("preserves an explicitly-cleared ([]) badge config", () => {
    const doc = new Y.Doc();
    boardMeta(doc).set("badgeConfig", []);
    expect(getBoard(doc, "u1").badgeConfig).toEqual([]);
  });
});

describe("moveCard", () => {
  it("moves a card to a different status (status + ord updated) and logs a status change", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    moveCard(doc, a, DOING, { afterId: null, beforeId: null }, "1", NOW + 1, "u1");
    expect(cardsInStatus(doc, TODO).map((c) => c.id)).toEqual([]);
    expect(cardsInStatus(doc, DOING).map((c) => c.id)).toEqual([a]);
    expect(getCard(doc, a)?.status).toBe(DOING);

    const statusLog = listActivity(doc).filter((e) => e.type === "status");
    expect(statusLog).toHaveLength(1);
    expect(statusLog[0]).toMatchObject({ type: "status", cardId: a, from: TODO, to: DOING });
  });

  it("places a moved card strictly between neighbors of the destination status", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: DOING, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: DOING, title: "B", now: NOW, clientId: "1" });
    const c = addCard(doc, { status: TODO, title: "C", now: NOW, clientId: "1" });
    // Move C into DOING between A and B → A, C, B
    moveCard(doc, c, DOING, { afterId: a, beforeId: b }, "1", NOW + 1);
    expect(cardsInStatus(doc, DOING).map((x) => x.id)).toEqual([a, c, b]);
  });

  it("reorders within the same status without a spurious status activity", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    const c = addCard(doc, { status: TODO, title: "C", now: NOW, clientId: "1" });
    // Move C between A and B → A, C, B (same status)
    moveCard(doc, c, TODO, { afterId: a, beforeId: b }, "1", NOW + 1);
    expect(cardsInStatus(doc, TODO).map((x) => x.id)).toEqual([a, c, b]);
    expect(getCard(doc, c)?.status).toBe(TODO);
    // Pure reorder is not a status change.
    expect(listActivity(doc).filter((e) => e.type === "status")).toHaveLength(0);
  });

  it("keeps repeated inserts into the same gap ordered", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    const x = addCard(doc, { status: TODO, title: "X", now: NOW, clientId: "1" });
    const y = addCard(doc, { status: TODO, title: "Y", now: NOW, clientId: "1" });
    moveCard(doc, x, TODO, { afterId: a, beforeId: b }, "1", NOW);
    moveCard(doc, y, TODO, { afterId: a, beforeId: x }, "1", NOW);
    expect(cardsInStatus(doc, TODO).map((c) => c.id)).toEqual([a, y, x, b]);
  });

  it("computes a valid boundary ord at list start/end", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    // Move B to the very start (before A)
    moveCard(doc, b, TODO, { afterId: null, beforeId: a }, "1", NOW);
    expect(cardsInStatus(doc, TODO).map((c) => c.id)).toEqual([b, a]);
  });
});

describe("relations (untyped, symmetric)", () => {
  it("relates two cards symmetrically", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: DOING, title: "B", now: NOW, clientId: "1" });
    addRelation(doc, a, b, NOW);
    expect(getCard(doc, a)?.relatedIds).toEqual([b]);
    expect(getCard(doc, b)?.relatedIds).toEqual([a]);
  });

  it("removes a relation from both cards", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addRelation(doc, a, b, NOW);
    removeRelation(doc, a, b, NOW);
    expect(getCard(doc, a)?.relatedIds).toEqual([]);
    expect(getCard(doc, b)?.relatedIds).toEqual([]);
  });

  it("is a no-op for a self-relation", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    addRelation(doc, a, a, NOW);
    expect(getCard(doc, a)?.relatedIds).toEqual([]);
  });

  it("is a no-op when the other card is missing (no partial write)", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    addRelation(doc, a, "ghost", NOW);
    expect(getCard(doc, a)?.relatedIds).toEqual([]);
  });

  it("is idempotent (adding twice keeps one entry each side)", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addRelation(doc, a, b, NOW);
    addRelation(doc, a, b, NOW);
    expect(getCard(doc, a)?.relatedIds).toEqual([b]);
    expect(getCard(doc, b)?.relatedIds).toEqual([a]);
  });

  it("round-trips relatedIds through export → import", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addRelation(doc, a, b, NOW);
    const snap = boardToSnapshot(doc, "u");
    const copy = new Y.Doc();
    buildBoardFromSnapshot(copy, snap, NOW);
    expect(getCard(copy, a)?.relatedIds).toEqual([b]);
    expect(getCard(copy, b)?.relatedIds).toEqual([a]);
  });
});

describe("urgent floats to top", () => {
  const idsInStatus = (doc: Y.Doc, status: Status) =>
    cardsInStatus(doc, status).map((c) => c.title);

  it("moves a card to the top of its column when set to Urgent", () => {
    const { doc } = setup();
    addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    const c = addCard(doc, { status: TODO, title: "C", now: NOW, clientId: "1" });
    expect(idsInStatus(doc, TODO)).toEqual(["A", "B", "C"]);
    setCardPriority(doc, c, Priority.Urgent, NOW + 1, "1");
    expect(idsInStatus(doc, TODO)).toEqual(["C", "A", "B"]);
  });

  it("creates an Urgent card at the top of its column", () => {
    const { doc } = setup();
    addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addCard(doc, { status: TODO, title: "U", priority: Priority.Urgent, now: NOW, clientId: "1" });
    expect(idsInStatus(doc, TODO)).toEqual(["U", "A", "B"]);
  });

  it("does not reorder when set to a non-Urgent priority", () => {
    const { doc } = setup();
    addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    setCardPriority(doc, b, Priority.High, NOW + 1, "1");
    expect(idsInStatus(doc, TODO)).toEqual(["A", "B"]);
  });

  it("does not reorder when the card is already Urgent", () => {
    const { doc } = setup();
    const a = addCard(doc, {
      status: TODO,
      title: "A",
      priority: Priority.Urgent,
      now: NOW,
      clientId: "1",
    });
    addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    // A is already Urgent (and at top). Re-set Urgent → no change, no crash.
    setCardPriority(doc, a, Priority.Urgent, NOW + 1, "1");
    expect(idsInStatus(doc, TODO)).toEqual(["A", "B"]);
  });

  it("floats the most-recently-set Urgent card to the very top", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    setCardPriority(doc, a, Priority.Urgent, NOW + 1, "1");
    setCardPriority(doc, b, Priority.Urgent, NOW + 2, "1");
    expect(idsInStatus(doc, TODO)).toEqual(["B", "A"]);
  });

  it("handles the only card in a column (no neighbors)", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    setCardPriority(doc, a, Priority.Urgent, NOW + 1, "1");
    expect(idsInStatus(doc, TODO)).toEqual(["A"]);
  });
});

describe("hard delete", () => {
  it("removes the card from selectors and the doc", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    deleteCard(doc, a, NOW);
    expect(getCard(doc, a)).toBeNull();
    expect(boardCards(doc).has(a)).toBe(false);
    expect(cardsInStatus(doc, TODO).map((c) => c.title)).toEqual(["B"]);
  });

  it("strips the deleted id from other cards' relations (no dangling ref)", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: TODO, title: "B", now: NOW, clientId: "1" });
    addRelation(doc, a, b, NOW);
    deleteCard(doc, a, NOW);
    expect(getCard(doc, b)?.relatedIds).toEqual([]);
  });

  it("is a no-op for an unknown id", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    deleteCard(doc, "ghost", NOW);
    expect(getCard(doc, a)?.title).toBe("A");
  });

  it("archive keeps the card in the doc, unlike delete", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    archiveCard(doc, a, NOW);
    expect(boardCards(doc).has(a)).toBe(true); // still stored (future archive view)
    expect(getCard(doc, a)?.archived).toBe(true);
    deleteCard(doc, a, NOW);
    expect(boardCards(doc).has(a)).toBe(false); // now gone
  });
});

describe("soft-delete", () => {
  it("archiving a card removes it from selectors but keeps it in the map", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    archiveCard(doc, a, NOW);
    expect(cardsInStatus(doc, TODO)).toEqual([]);
    expect(boardCards(doc).has(a)).toBe(true);
    expect(getCard(doc, a)?.archived).toBe(true);
  });
});

describe("workflow status (picker)", () => {
  it("records a status change in the activity log", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    setCardStatus(doc, a, Status.InProgress, NOW + 1, "actor-1");

    expect(getCard(doc, a)?.status).toBe(Status.InProgress);
    const statusLog = listActivity(doc).filter((e) => e.type === "status");
    expect(statusLog).toHaveLength(1);
    expect(statusLog[0]).toMatchObject({
      type: "status",
      cardId: a,
      from: DEFAULT_STATUS,
      to: Status.InProgress,
      actor: "actor-1",
    });
    // The card now lives in the matching column.
    expect(cardsInStatus(doc, Status.InProgress).map((c) => c.id)).toEqual([a]);
  });

  it("no-ops (no status activity) when the status is unchanged", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    setCardStatus(doc, a, DEFAULT_STATUS, NOW + 1);
    expect(listActivity(doc).filter((e) => e.type === "status")).toHaveLength(0);
  });
});

describe("allLiveCards", () => {
  it("returns every non-archived card across statuses, excluding archived", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    const b = addCard(doc, { status: DOING, title: "B", now: NOW, clientId: "1" });
    const gone = addCard(doc, { status: TODO, title: "Gone", now: NOW, clientId: "1" });
    archiveCard(doc, gone, NOW);
    const ids = allLiveCards(doc)
      .map((c) => c.id)
      .sort();
    expect(ids).toEqual([a, b].sort());
  });
});

describe("moveLink", () => {
  function seedLinks() {
    const { doc } = setup();
    const card = addCard(doc, { status: TODO, title: "Card", now: NOW, clientId: "1" });
    const l1 = addLink(doc, {
      cardId: card,
      url: "https://example.com/a",
      now: NOW,
      clientId: "1",
    });
    const l2 = addLink(doc, {
      cardId: card,
      url: "https://example.com/b",
      now: NOW,
      clientId: "1",
    });
    const l3 = addLink(doc, {
      cardId: card,
      url: "https://example.com/c",
      now: NOW,
      clientId: "1",
    });
    return { doc, card, l1, l2, l3 };
  }
  const order = (doc: Y.Doc, card: string) => getCard(doc, card)!.links.map((l) => l.id);

  it("reorders a link between neighbors", () => {
    const { doc, card, l1, l2, l3 } = seedLinks();
    expect(order(doc, card)).toEqual([l1, l2, l3]);
    // Move l1 down: place it after l2, before l3 → [l2, l1, l3].
    moveLink(doc, card, l1, { afterId: l2, beforeId: l3 }, "1", NOW);
    expect(order(doc, card)).toEqual([l2, l1, l3]);
  });

  it("moves a link to the very start", () => {
    const { doc, card, l1, l3 } = seedLinks();
    moveLink(doc, card, l3, { afterId: null, beforeId: l1 }, "1", NOW);
    expect(order(doc, card)[0]).toBe(l3);
  });
});

describe("field setters", () => {
  it("sets a typed field and bumps updatedAt", () => {
    const { doc } = setup();
    const a = addCard(doc, { status: TODO, title: "A", now: NOW, clientId: "1" });
    setCardPriority(doc, a, Priority.Urgent, NOW + 5, "1");
    const card = getCard(doc, a);
    expect(card?.priority).toBe(Priority.Urgent);
    expect(card?.updatedAt).toBe(NOW + 5);
  });
});

describe("concurrency (merged docs)", () => {
  it("two docs moving the same card to different statuses converge to exactly one", () => {
    const { doc } = setup();
    const card = addCard(doc, { status: TODO, title: "X", now: NOW, clientId: "1" });
    const docB = clone(doc);

    moveCard(doc, card, DOING, {}, "A", NOW);
    moveCard(docB, card, DONE, {}, "B", NOW);
    merge(doc, docB);

    const statusA = getCard(doc, card)?.status;
    const statusB = getCard(docB, card)?.status;
    expect(statusA).toBe(statusB); // converged
    expect([DOING, DONE]).toContain(statusA);

    // Present in exactly one status column, never duplicated.
    const inDoing = cardsInStatus(doc, DOING).filter((c) => c.id === card).length;
    const inDone = cardsInStatus(doc, DONE).filter((c) => c.id === card).length;
    expect(inDoing + inDone).toBe(1);
  });

  it("merges concurrent description edits at different positions (Y.Text)", () => {
    const { doc } = setup();
    const card = addCard(doc, { status: TODO, title: "X", now: NOW, clientId: "1" });
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
});
