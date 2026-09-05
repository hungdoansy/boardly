import {
  type BoardSnapshot,
  DEFAULT_ZOOM,
  boardSnapshotSchema,
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
  getBoard,
  getCard,
  initBoard,
  listArchivedCards,
  listArchivedProjects,
  listLabels,
  listProjects,
  listViews,
  saveView,
  setCardDueDate,
  setCardPriority,
  setCardProject,
  setCardTitle,
  setShowEmptyColumns,
  setZoom,
} from "./board-doc";
import { applySnapshot } from "./io";

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

  // The anti-regression case for the no-op bug (UNIT-21). This test used to
  // assert the opposite — "is idempotent-guarded (won't overwrite an initialized
  // doc)" — which is exactly the behaviour that made import do nothing once the
  // board became one doc per user: `importBoard` resolves the caller's existing
  // doc, which always carries `meta.createdAt`, so the guard fired on the only
  // call. Every other test in this file builds into a fresh `new Y.Doc()`, which
  // is why the guard survived CI everywhere else.
  it("writes into a doc that is already initialized and already has cards", () => {
    const { doc } = seededDoc();
    expect(boardToSnapshot(doc, USER_ID).cards).toHaveLength(2);

    buildBoardFromSnapshot(doc, parseObsidian("## X\n- [ ] Y", "Imported"), NOW + 5);

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.board.title).toBe("Imported");
    expect(snap.cards.map((c) => c.title)).toEqual(["Y"]);
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

// ---------------------------------------------------------------------------
// The three apply modes (UNIT-21 U4). Everything below goes through
// `applySnapshot`, which stages in a detached doc and lands one update.
// ---------------------------------------------------------------------------

const snapshotOf = (partial: unknown): BoardSnapshot => boardSnapshotSchema.parse(partial);

/** A second board, so a "file" can be a real export rather than a hand-written literal. */
function otherDoc() {
  const doc = new Y.Doc();
  initBoard(doc, { title: "Other", now: NOW });
  return doc;
}

describe("replace mode (R6, KTD7)", () => {
  it("leaves exactly the file's content — no pre-existing card, project or label survives", () => {
    const { doc, a, lbl } = seededDoc();
    const stale = addProject(doc, { name: "Legacy", color: "#eb5757", now: NOW, clientId: "1" });

    const source = otherDoc();
    const p = addProject(source, { name: "Web", color: "#5e6ad2", now: NOW, clientId: "2" });
    const l = addLabel(source, { name: "chore", color: "#26b5ce", now: NOW, clientId: "2" });
    const c = addCard(source, { status: Status.Todo, title: "Only me", now: NOW, clientId: "2" });
    setCardProject(source, c, p, NOW);
    assignLabel(source, c, l, NOW);

    applySnapshot(doc, boardToSnapshot(source, "u2"), { mode: "replace", now: NOW + 1 });

    const snap = boardToSnapshot(doc, USER_ID);
    expect(snap.cards.map((card) => card.id)).toEqual([c]);
    expect(snap.cards.map((card) => card.id)).not.toContain(a);
    expect(snap.projects.map((project) => project.id)).toEqual([p]);
    expect(snap.projects.map((project) => project.id)).not.toContain(stale);
    expect(snap.labels.map((label) => label.id)).toEqual([l]);
    expect(snap.labels.map((label) => label.id)).not.toContain(lbl);
    expect(snap.cards[0]).toMatchObject({ projectId: p, labelIds: [l] });
  });

  it("loads the file's saved views and preserves the device's zoom and showEmptyColumns", () => {
    const { doc } = seededDoc();
    setZoom(doc, 1.25, NOW);
    setShowEmptyColumns(doc, false, NOW);
    saveView(doc, { id: "mine", name: "Mine", filter: { op: "and", clauses: [] } }, NOW);

    const source = otherDoc();
    setZoom(source, 0.9, NOW);
    setShowEmptyColumns(source, true, NOW);
    saveView(source, { id: "theirs", name: "Theirs", filter: { op: "and", clauses: [] } }, NOW);

    applySnapshot(doc, boardToSnapshot(source, "u2"), { mode: "replace", now: NOW + 1 });

    // Views are board content and are replaced; zoom/showEmptyColumns are the
    // device's and are not.
    expect(listViews(doc).map((v) => v.id)).toEqual(["theirs"]);
    expect(getBoard(doc, USER_ID)).toMatchObject({ zoom: 1.25, showEmptyColumns: false });
  });

  it("leaves the board's own views in place when the file carries none (a v1 file)", () => {
    const { doc } = seededDoc();
    saveView(doc, { id: "mine", name: "Mine", filter: { op: "and", clauses: [] } }, NOW);
    const v1 = snapshotOf({ version: 1, board: { title: "Legacy export" }, cards: [] });

    applySnapshot(doc, v1, { mode: "replace", now: NOW + 1 });

    expect(listViews(doc).map((v) => v.id)).toEqual(["mine"]);
    expect(getBoard(doc, USER_ID).title).toBe("Legacy export");
  });

  it("keeps the board's own createdAt rather than restamping it", () => {
    const { doc } = seededDoc();
    applySnapshot(doc, snapshotOf({ board: { title: "New" }, cards: [] }), {
      mode: "replace",
      now: NOW + 9,
    });
    expect(getBoard(doc, USER_ID).createdAt).toBe(NOW);
  });
});

describe("merge mode (R7, R10-R15)", () => {
  it("adds a file-only card, updates a card in both, and leaves a board-only card alone", () => {
    const { doc, a } = seededDoc();
    const untouched = boardToSnapshot(doc, USER_ID).cards.find((c) => c.id !== a)!;

    const file = snapshotOf({
      board: { title: "ignored" },
      cards: [
        { id: a, title: "Fix login (edited)", status: Status.Todo, updatedAt: NOW + 100 },
        { id: "newcard", title: "From the file", status: Status.Todo, updatedAt: NOW + 100 },
      ],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 200 });

    expect(result.cards).toEqual({ created: 1, updated: 1, skipped: 0 });
    expect(getCard(doc, a)?.title).toBe("Fix login (edited)");
    expect(getCard(doc, "newcard")?.title).toBe("From the file");
    expect(boardToSnapshot(doc, USER_ID).cards.find((c) => c.id === untouched.id)).toEqual(
      untouched,
    );
    // Merge pulls content in; it never renames the board (R7).
    expect(getBoard(doc, USER_ID).title).toBe("Roadmap");
  });

  it("keeps the board's version of a card the file exports as older (AE1, R12)", () => {
    const { doc, a } = seededDoc();
    setCardTitle(doc, a, "Fix login v2", NOW + 1000);

    const file = snapshotOf({
      board: { title: "x" },
      cards: [{ id: a, title: "Fix login (last week)", status: Status.Todo, updatedAt: NOW }],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 2000 });

    expect(getCard(doc, a)?.title).toBe("Fix login v2");
    expect(result.cards).toMatchObject({ updated: 0, skipped: 1 });
    expect(result.stale).toEqual([
      {
        cardId: a,
        title: "Fix login v2",
        fileUpdatedAt: NOW,
        boardUpdatedAt: NOW + 1000,
      },
    ]);
  });

  it("applies a card whose updatedAt is absent — a zero carries no staleness claim (R12)", () => {
    const { doc, a } = seededDoc();
    setCardTitle(doc, a, "Edited on the board", NOW + 1000);
    // A hand-authored snapshot defaults `updatedAt` to 0; that is "unknown",
    // not "older than everything".
    const file = snapshotOf({
      board: { title: "x" },
      cards: [{ id: a, title: "From a hand-written file", status: Status.Todo }],
    });

    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 2000 });

    expect(getCard(doc, a)?.title).toBe("From a hand-written file");
    expect(result.stale).toEqual([]);
  });

  it("re-running the same file changes nothing (R15)", () => {
    const { doc, a } = seededDoc();
    const file = snapshotOf({
      board: { title: "x" },
      labels: [{ id: "l-new", name: "chore", color: "#26b5ce" }],
      projects: [{ id: "p-new", name: "Web", color: "#5e6ad2" }],
      cards: [
        { id: a, title: "Edited", status: Status.Todo, updatedAt: NOW + 5, projectId: "p-new" },
        { id: "c-new", title: "New", status: Status.Done, updatedAt: NOW + 5, labelIds: ["l-new"] },
      ],
    });

    applySnapshot(doc, file, { mode: "merge", now: NOW + 10 });
    const after1 = boardToSnapshot(doc, USER_ID);
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 20 });
    const after2 = boardToSnapshot(doc, USER_ID);

    expect(after2).toEqual(after1);
    expect(result.cards).toEqual({ created: 0, updated: 0, skipped: 2 });
    expect(result.projects).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(result.labels).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it("fuses a project the board holds under a name that only normalizes alike (AE2, R10)", () => {
    const { doc } = seededDoc();
    const boardProject = addProject(doc, {
      name: "Web app",
      color: "#5e6ad2",
      now: NOW,
      clientId: "1",
    });

    const file = snapshotOf({
      board: { title: "x" },
      projects: [{ id: "p-file", name: "web app", color: "#eb5757" }],
      cards: [{ id: "c1", title: "Joins the survivor", status: Status.Todo, projectId: "p-file" }],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 1 });

    expect(listProjects(doc).map((p) => [p.id, p.name, p.color])).toEqual([
      [boardProject, "Web app", "#5e6ad2"],
    ]);
    expect(getCard(doc, "c1")?.projectId).toBe(boardProject);
    expect(result.fusions).toEqual([
      {
        kind: "project",
        fromId: "p-file",
        fromName: "web app",
        intoId: boardProject,
        intoName: "Web app",
        into: "board",
        nameKey: "web-app",
      },
    ]);
  });

  it("does not match an archived project by name; the file's is created new (AE3, R11)", () => {
    const { doc } = seededDoc();
    const hidden = addProject(doc, { name: "Web app", color: "#5e6ad2", now: NOW, clientId: "1" });
    archiveProject(doc, hidden, NOW + 1);

    const file = snapshotOf({
      board: { title: "x" },
      projects: [{ id: "p-file", name: "Web app", color: "#eb5757" }],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 2 });

    expect(listArchivedProjects(doc).map((p) => p.id)).toEqual([hidden]);
    expect(listProjects(doc).map((p) => p.id)).toEqual(["p-file"]);
    expect(result.fusions).toEqual([]);
  });

  it("never flips an existing project's archived flag, in either direction (R11)", () => {
    const { doc } = seededDoc();
    const live = addProject(doc, { name: "Live", color: "#5e6ad2", now: NOW, clientId: "1" });
    const hidden = addProject(doc, { name: "Hidden", color: "#eb5757", now: NOW, clientId: "1" });
    archiveProject(doc, hidden, NOW + 1);

    const file = snapshotOf({
      board: { title: "x" },
      projects: [
        { id: live, name: "Live", color: "#5e6ad2", archived: true, deletedAt: NOW + 5 },
        { id: hidden, name: "Hidden", color: "#eb5757", archived: false },
      ],
    });
    applySnapshot(doc, file, { mode: "merge", now: NOW + 6 });

    expect(listProjects(doc).map((p) => p.id)).toEqual([live]);
    expect(listArchivedProjects(doc).map((p) => p.id)).toEqual([hidden]);
  });

  it("leaves a live board card live when the file has it archived (AE7, R11)", () => {
    const { doc, a } = seededDoc();
    const file = snapshotOf({
      board: { title: "x" },
      cards: [
        {
          id: a,
          title: "Fix login",
          status: Status.Todo,
          archived: true,
          deletedAt: NOW + 1,
          updatedAt: NOW + 500,
        },
      ],
    });
    applySnapshot(doc, file, { mode: "merge", now: NOW + 600 });

    expect(allLiveCards(doc).map((c) => c.id)).toContain(a);
    expect(listArchivedCards(doc)).toHaveLength(0);
  });

  it("drops a project reference that resolves to nothing; the card still imports (AE5, R13)", () => {
    const { doc } = seededDoc();
    const file = snapshotOf({
      board: { title: "x" },
      cards: [{ id: "orphan", title: "No project", status: Status.Todo, projectId: "ghost" }],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 1 });

    expect(getCard(doc, "orphan")?.title).toBe("No project");
    expect(getCard(doc, "orphan")?.projectId).toBeUndefined();
    expect(result.dropped).toEqual([{ cardId: "orphan", field: "projectId", value: "ghost" }]);
  });

  it("places merged cards after the existing ones in each status, in the file's order (R14)", () => {
    const { doc } = seededDoc();
    addCard(doc, { status: Status.Todo, title: "Board second", now: NOW, clientId: "1" });

    // Ords that would sort the file's cards to the very top if they were honoured.
    const file = snapshotOf({
      board: { title: "x" },
      cards: [
        { id: "f2", title: "File second", status: Status.Todo, ord: "Zz-f" },
        { id: "f1", title: "File first", status: Status.Todo, ord: "Zy-f" },
      ],
    });
    applySnapshot(doc, file, { mode: "merge", now: NOW + 1 });

    expect(cardsInStatus(doc, Status.Todo).map((c) => c.title)).toEqual([
      "Fix login",
      "Board second",
      "File first",
      "File second",
    ]);
  });
});

describe("assignee and provenance (R20)", () => {
  it("drops an assignee who is not the importing user and keeps createdBy", () => {
    const { doc } = seededDoc();
    const file = snapshotOf({
      board: { title: "x" },
      cards: [
        {
          id: "c1",
          title: "Someone else's",
          status: Status.Todo,
          assigneeId: "u-other",
          createdBy: "u-other",
        },
        { id: "c2", title: "Mine", status: Status.Todo, assigneeId: USER_ID },
      ],
    });
    const result = applySnapshot(doc, file, { mode: "merge", now: NOW + 1, userId: USER_ID });

    expect(getCard(doc, "c1")?.assigneeId).toBeUndefined();
    expect(getCard(doc, "c1")?.createdBy).toBe("u-other");
    expect(getCard(doc, "c2")?.assigneeId).toBe(USER_ID);
    expect(result.dropped).toEqual([{ cardId: "c1", field: "assigneeId", value: "u-other" }]);
  });
});

describe("generated ords (R23)", () => {
  it("builds a snapshot that carries no ord at all, in array order", () => {
    const fresh = new Y.Doc();
    const file = snapshotOf({
      board: { title: "Hand written" },
      projects: [
        { id: "p1", name: "One", color: "#5e6ad2" },
        { id: "p2", name: "Two", color: "#eb5757" },
      ],
      labels: [
        { id: "l1", name: "a", color: "#5e6ad2" },
        { id: "l2", name: "b", color: "#eb5757" },
      ],
      cards: [
        { id: "c1", title: "First", status: Status.Todo },
        { id: "c2", title: "Second", status: Status.Todo },
        { id: "c3", title: "Third", status: Status.Todo },
      ],
    });
    applySnapshot(fresh, file, { mode: "replace", now: NOW });

    expect(cardsInStatus(fresh, Status.Todo).map((c) => c.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(listProjects(fresh).map((p) => p.name)).toEqual(["One", "Two"]);
    expect(listLabels(fresh).map((l) => l.name)).toEqual(["a", "b"]);
    expect(cardsInStatus(fresh, Status.Todo).every((c) => c.ord !== "")).toBe(true);
  });
});

describe("add-as-copy mode (R8)", () => {
  it("doubles the board's own export with no id collisions and no fusions", () => {
    const { doc, a, lbl } = seededDoc();
    const project = addProject(doc, { name: "Web", color: "#5e6ad2", now: NOW, clientId: "1" });
    setCardProject(doc, a, project, NOW);
    const before = boardToSnapshot(doc, USER_ID);

    const result = applySnapshot(doc, before, { mode: "copy", now: NOW + 1 });
    const after = boardToSnapshot(doc, USER_ID);

    expect(after.cards).toHaveLength(before.cards.length * 2);
    expect(after.labels).toHaveLength(2);
    expect(after.projects).toHaveLength(2);
    expect(result.fusions).toEqual([]);
    expect(new Set(after.cards.map((c) => c.id)).size).toBe(after.cards.length);

    // The copies are genuinely new entities pointing at their own project.
    const copiedLabels = after.labels.filter((l) => l.id !== lbl);
    expect(copiedLabels.map((l) => l.name)).toEqual(["bug"]);
    const copiedProject = after.projects.find((p) => p.id !== project)!;
    const copiedCard = after.cards.find((c) => c.id !== a && c.title === "Fix login")!;
    expect(copiedCard.projectId).toBe(copiedProject.id);
    expect(copiedCard.labelIds).toEqual([copiedLabels[0]!.id]);
  });
});

describe("ticket numbers across an import (KTD5)", () => {
  it("leaves every pre-existing ticket id alone, even against an older incoming card", () => {
    const { doc, a } = seededDoc();
    const before = getCard(doc, a)!.shortId;

    const file = snapshotOf({
      board: { title: "x" },
      // Same number as the board's first card, and created earlier — which is
      // precisely the case repair-on-read would resolve against the board.
      cards: [{ id: "incoming", title: "Older", status: Status.Todo, number: 1, createdAt: 1 }],
    });
    applySnapshot(doc, file, { mode: "merge", now: NOW + 1 });

    expect(getCard(doc, a)!.shortId).toBe(before);
    expect(getCard(doc, "incoming")!.number).not.toBe(1);
  });

  it("advances shortIdSeq so the next card created does not collide", () => {
    const { doc } = seededDoc();
    const file = snapshotOf({
      board: { title: "x" },
      cards: [{ id: "big", title: "High number", status: Status.Todo, number: 90 }],
    });
    applySnapshot(doc, file, { mode: "merge", now: NOW + 1 });

    const next = addCard(doc, { status: Status.Todo, title: "After", now: NOW + 2, clientId: "1" });
    const numbers = boardToSnapshot(doc, USER_ID).cards.map((c) => c.number);
    expect(getCard(doc, next)!.number).toBe(91);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("atomicity (KTD8, R18, R25)", () => {
  it("leaves the live doc byte-identical when the apply throws part-way", () => {
    const { doc } = seededDoc();
    const before = Y.encodeStateAsUpdate(doc);

    // The first card is written with its verbatim (malformed) key; generating a
    // key after it throws inside `fractional-indexing`. So the staging doc is
    // genuinely half-written when the throw happens.
    const file = snapshotOf({
      board: { title: "Should never land" },
      cards: [
        { id: "c1", title: "Written into staging", status: Status.Todo, ord: "!!!" },
        { id: "c2", title: "Never reached", status: Status.Todo },
      ],
    });

    expect(() => applySnapshot(doc, file, { mode: "replace", now: NOW + 1 })).toThrow();

    // Compare the encoded state, not a few fields: a partial apply can leave
    // structs behind that a field-level check would walk straight past.
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    expect(boardToSnapshot(doc, USER_ID).board.title).toBe("Roadmap");
  });

  it("lands the whole apply as a single update", () => {
    const { doc } = seededDoc();
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });

    applySnapshot(
      doc,
      snapshotOf({
        board: { title: "One update" },
        labels: [{ id: "l1", name: "a", color: "#5e6ad2" }],
        cards: [
          { id: "c1", title: "A", status: Status.Todo },
          { id: "c2", title: "B", status: Status.Done },
        ],
      }),
      { mode: "replace", now: NOW + 1 },
    );

    expect(updates).toBe(1);
  });
});

describe("export order is stable (UNIT-21)", () => {
  it("is unchanged by a replace that rebuilds every card", () => {
    const { doc } = seededDoc();
    for (const title of ["A", "B", "C", "D"]) {
      addCard(doc, { status: Status.Todo, title, now: NOW, clientId: "1" });
    }
    const before = boardToSnapshot(doc, USER_ID);

    // Replace clears the cards map and writes every card back, which permutes
    // the map's internal key order — the whole reason the export sorts.
    applySnapshot(doc, before, { mode: "replace", now: NOW + 1 });

    expect(boardToSnapshot(doc, USER_ID)).toEqual(before);
  });
});
