import { exportJson, parseJson, parseObsidian, Priority, Severity } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  addColumn,
  assignLabel,
  boardToSnapshot,
  buildBoardFromSnapshot,
  addLabel,
  initBoard,
  liveColumns,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  setColumnWipLimit,
} from "./board-doc";

const NOW = 1_700_000_000_000;
const USER_ID = "u1";

function seededDoc() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Roadmap", icon: "🗺️", now: NOW });
  const c1 = addColumn(doc, { title: "To Do", now: NOW, clientId: "1" });
  const c2 = addColumn(doc, { title: "Doing", now: NOW, clientId: "1" });
  setColumnWipLimit(doc, c2, 3, NOW);
  const lbl = addLabel(doc, { name: "bug", color: "#eb5757", now: NOW, clientId: "1" });
  const a = addCard(doc, { columnId: c1, title: "Fix login", now: NOW, clientId: "1" });
  addCard(doc, { columnId: c2, title: "Ship it", now: NOW, clientId: "1" });
  setCardPriority(doc, a, Priority.High, NOW, "1");
  setCardSeverity(doc, a, Severity.S2, NOW, "1");
  setCardDueDate(doc, a, { at: NOW + 1000, hasTime: false }, NOW, "1");
  assignLabel(doc, a, lbl, NOW);
  return { doc, c1, c2, a, lbl };
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

  it("preserves columns (order + wipLimit), cards (fields), labels, and assignment", () => {
    const { doc } = seededDoc();
    const fresh = new Y.Doc();
    buildBoardFromSnapshot(fresh, boardToSnapshot(doc, USER_ID), NOW);

    const cols = liveColumns(fresh);
    expect(cols.map((c) => c.title)).toEqual(["To Do", "Doing"]);
    expect(cols.find((c) => c.title === "Doing")?.wipLimit).toBe(3);

    const snap = boardToSnapshot(fresh, USER_ID);
    const fix = snap.cards.find((c) => c.title === "Fix login")!;
    expect(fix).toMatchObject({
      priority: Priority.High,
      severity: Severity.S2,
      labelIds: [snap.labels[0]!.id],
    });
    expect(fix.dueDate?.at).toBe(NOW + 1000);
    expect(snap.labels.map((l) => l.name)).toEqual(["bug"]);
  });

  it("builds a board from an Obsidian import", () => {
    const md = ["## Backlog", "- [ ] A", "- [x] B", "## Done", "- [x] C"].join("\n");
    const fresh = new Y.Doc();
    buildBoardFromSnapshot(fresh, parseObsidian(md, "Imported"), NOW);
    const snap = boardToSnapshot(fresh, USER_ID);
    expect(snap.board.title).toBe("Imported");
    expect(snap.columns.map((c) => c.title)).toEqual(["Backlog", "Done"]);
    expect(snap.cards.map((c) => c.title).sort()).toEqual(["A", "B", "C"]);
    // Card timestamps default to `now` when the import had none.
    expect(snap.cards.every((c) => c.createdAt === NOW)).toBe(true);
  });

  it("is idempotent-guarded (won't overwrite an initialized doc)", () => {
    const { doc } = seededDoc();
    buildBoardFromSnapshot(doc, parseObsidian("## X\n- [ ] Y"), NOW + 5);
    // Original board untouched.
    expect(boardToSnapshot(doc, USER_ID).board.title).toBe("Roadmap");
  });
});
