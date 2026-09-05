import {
  DEFAULT_ZOOM,
  exportJson,
  parseJson,
  parseObsidian,
  Priority,
  type SavedView,
  Status,
} from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addCard,
  addLabel,
  addProject,
  allLiveCards,
  archiveCard,
  archiveProject,
  assignLabel,
  boardToSnapshot,
  buildBoardFromSnapshot,
  cardsInStatus,
  initBoard,
  saveView,
  setCardDueDate,
  setCardPriority,
  setCardProject,
  setShowEmptyColumns,
  setZoom,
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

// The read side of the widened v2 format (UNIT-21 U2 / R1): the export is a
// backup of the whole doc, not just the part the board renders today. Every
// assertion here reads `boardToSnapshot` only — writing these sections back into
// a doc is `buildBoardFromSnapshot`'s job and lands in U4, so nothing below
// round-trips through it.
describe("board snapshot carries the whole doc (R1)", () => {
  it("exports every project, archived ones included, with their archived flag", () => {
    const { doc } = seededDoc();
    const live = addProject(doc, { name: "Web", color: "#5e6ad2", now: NOW, clientId: "1" });
    const hidden = addProject(doc, { name: "Legacy", color: "#eb5757", now: NOW, clientId: "1" });
    archiveProject(doc, hidden, NOW + 1);

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.projects.map((p) => [p.id, p.name, p.archived])).toEqual([
      [live, "Web", false],
      [hidden, "Legacy", true],
    ]);
  });

  it("carries an archived project's deletedAt, and omits it on a live one", () => {
    const { doc } = seededDoc();
    const live = addProject(doc, { name: "Web", color: "#5e6ad2", now: NOW, clientId: "1" });
    const hidden = addProject(doc, { name: "Legacy", color: "#eb5757", now: NOW, clientId: "1" });
    archiveProject(doc, hidden, NOW + 7);

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.projects.find((p) => p.id === hidden)).toMatchObject({
      archived: true,
      deletedAt: NOW + 7,
    });
    expect(snap.projects.find((p) => p.id === live)).not.toHaveProperty("deletedAt");
  });

  it("exports an empty projects array — never a missing key — when there are none", () => {
    const { doc } = seededDoc();
    expect(boardToSnapshot(doc, USER_ID)).toHaveProperty("projects", []);
  });

  it("carries a card's project assignment (and leaves an unassigned card without one)", () => {
    const { doc, a } = seededDoc();
    const project = addProject(doc, { name: "Web", color: "#5e6ad2", now: NOW, clientId: "1" });
    setCardProject(doc, a, project, NOW + 1);

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.cards.find((c) => c.id === a)?.projectId).toBe(project);
    expect(snap.cards.find((c) => c.id !== a)).not.toHaveProperty("projectId");
  });

  it("includes archived cards, flagged and carrying deletedAt", () => {
    const { doc, a } = seededDoc();
    archiveCard(doc, a, NOW + 3);

    const snap = boardToSnapshot(doc, USER_ID);
    // Both cards are present — the export is the whole board, not the live view.
    expect(snap.cards).toHaveLength(2);
    expect(snap.cards.find((c) => c.id === a)).toMatchObject({
      archived: true,
      deletedAt: NOW + 3,
    });
    expect(snap.cards.find((c) => c.id !== a)?.archived).toBe(false);
    // The live selector still hides it — including it is an export-only widening.
    expect(allLiveCards(doc).map((c) => c.id)).not.toContain(a);
  });

  it("carries board display preferences and saved views", () => {
    const { doc } = seededDoc();
    setShowEmptyColumns(doc, false, NOW + 1);
    setZoom(doc, 1.25, NOW + 2);
    const view: SavedView = {
      id: "v1",
      name: "Urgent work",
      filter: {
        op: "and",
        clauses: [{ field: "priority", condition: "is", values: [Priority.Urgent] }],
      },
      sort: { field: "dueDate", direction: "asc" },
      groupBy: "status",
      layout: "list",
      visibleBadges: ["priority"],
    };
    saveView(doc, view, NOW + 3);

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.board.showEmptyColumns).toBe(false);
    expect(snap.board.zoom).toBe(1.25);
    expect(snap.views).toEqual([view]);
  });

  it("falls back to the read-time defaults when the board never set them", () => {
    const { doc } = seededDoc();
    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.board).toMatchObject({ showEmptyColumns: true, zoom: DEFAULT_ZOOM });
    expect(snap.views).toEqual([]);
  });
});
