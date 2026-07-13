import { exportJson, parseJson, parseObsidian, Priority, Status } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  addLabel,
  allLiveCards,
  assignLabel,
  boardToSnapshot,
  buildBoardFromSnapshot,
  cardsInStatus,
  initBoard,
  setCardDueDate,
  setCardPriority,
} from "./board-doc";

const NOW = 1_700_000_000_000;
const USER_ID = "u1";

function seededDoc() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Roadmap", icon: "🗺️", now: NOW });
  const lbl = addLabel(doc, { name: "bug", color: "#eb5757", now: NOW, clientId: "1" });
  const a = addCard(doc, { status: Status.Todo, title: "Fix login", now: NOW, clientId: "1" });
  addCard(doc, { status: Status.Done, title: "Ship it", now: NOW, clientId: "1" });
  setCardPriority(doc, a, Priority.High, NOW, "1", "1");
  setCardDueDate(doc, a, { at: NOW + 1000, hasTime: false }, NOW, "1");
  assignLabel(doc, a, lbl, NOW);
  return { doc, a, lbl };
}

describe("board snapshot round-trip", () => {
  it("doc → snapshot → JSON → new doc → snapshot is identical", () => {
    const { doc } = seededDoc();
    const snap1 = boardToSnapshot(doc, USER_ID);

    // Serialize and re-import into a brand-new doc.
    const json = exportJson(snap1);
    const snap2 = parseJson(json);
    const fresh = new Y.Doc();
    buildBoardFromSnapshot(fresh, snap2, NOW);
    const snap3 = boardToSnapshot(fresh, USER_ID);

    expect(snap3).toEqual(snap1);
  });

  it("preserves cards (fields + status placement), labels, and assignment", () => {
    const { doc } = seededDoc();
    const fresh = new Y.Doc();
    buildBoardFromSnapshot(fresh, boardToSnapshot(doc, USER_ID), NOW);

    expect(cardsInStatus(fresh, Status.Todo).map((c) => c.title)).toEqual(["Fix login"]);
    expect(cardsInStatus(fresh, Status.Done).map((c) => c.title)).toEqual(["Ship it"]);

    const snap = boardToSnapshot(fresh, USER_ID);
    const fix = snap.cards.find((c) => c.title === "Fix login")!;
    expect(fix).toMatchObject({
      status: Status.Todo,
      priority: Priority.High,
      labelIds: [snap.labels[0]!.id],
    });
    expect(fix).not.toHaveProperty("severity");
    expect(fix.dueDate?.at).toBe(NOW + 1000);
    expect(snap.labels.map((l) => l.name)).toEqual(["bug"]);
  });

  it("builds a board from an Obsidian import, placing cards by status", () => {
    const md = ["## Backlog", "- [ ] A", "- [x] B", "## Done", "- [x] C"].join("\n");
    const fresh = new Y.Doc();
    buildBoardFromSnapshot(fresh, parseObsidian(md, "Imported"), NOW);
    const snap = boardToSnapshot(fresh, USER_ID);
    expect(snap.board.title).toBe("Imported");
    expect(snap.cards.map((c) => c.title).sort()).toEqual(["A", "B", "C"]);
    // A is unchecked under Backlog → backlog; B and C are checked → done.
    expect(cardsInStatus(fresh, Status.Backlog).map((c) => c.title)).toEqual(["A"]);
    expect(
      cardsInStatus(fresh, Status.Done)
        .map((c) => c.title)
        .sort(),
    ).toEqual(["B", "C"]);
    // Card timestamps default to `now` when the import had none.
    expect(allLiveCards(fresh).every((c) => c.createdAt === NOW)).toBe(true);
  });

  it("is idempotent-guarded (won't overwrite an initialized doc)", () => {
    const { doc } = seededDoc();
    buildBoardFromSnapshot(doc, parseObsidian("## X\n- [ ] Y"), NOW + 5);
    // Original board untouched.
    expect(boardToSnapshot(doc, USER_ID).board.title).toBe("Roadmap");
  });
});
