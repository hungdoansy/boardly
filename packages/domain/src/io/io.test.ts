import { describe, expect, it } from "vitest";

import { Priority, Severity } from "../enums";
import { Status } from "../status";
import { exportJson, parseJson } from "./json";
import { exportMarkdown } from "./markdown";
import { parseObsidian } from "./obsidian";
import { type BoardSnapshot, ImportError, SNAPSHOT_VERSION } from "./snapshot";

const snapshot: BoardSnapshot = {
  version: SNAPSHOT_VERSION,
  board: {
    title: "Roadmap",
    icon: "🗺️",
    description: "Q3 plan",
    shortIdPrefix: "RDM",
    badgeConfig: ["priority", "status"],
  },
  labels: [{ id: "l1", name: "bug", color: "#eb5757", ord: "a0" }],
  columns: [
    { id: "c1", title: "To Do", ord: "a0", archived: false },
    { id: "c2", title: "Doing", ord: "a1", wipLimit: 3, archived: false },
  ],
  cards: [
    {
      id: "k1",
      number: 1,
      title: "Fix login",
      description: "steps",
      columnId: "c1",
      ord: "a0",
      status: Status.Todo,
      priority: Priority.High,
      severity: Severity.S2,
      dueDate: { at: 1_700_000_000_000, hasTime: false },
      labelIds: ["l1"],
      checklist: [{ id: "ci1", text: "repro", done: true, ord: "a0" }],
      links: [{ id: "ln1", url: "https://x.com", provider: "generic", ord: "a0" }],
      archived: false,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: "k2",
      number: 2,
      title: "Ship it",
      description: "",
      columnId: "c2",
      ord: "a0",
      status: Status.Done,
      priority: Priority.None,
      severity: null,
      dueDate: null,
      labelIds: [],
      checklist: [],
      links: [],
      archived: false,
      createdAt: 3,
      updatedAt: 4,
    },
  ],
};

describe("JSON round-trip", () => {
  it("export → parse reproduces the snapshot exactly (columns, cards, order, labels, fields)", () => {
    const restored = parseJson(exportJson(snapshot));
    expect(restored).toEqual(snapshot);
  });

  it("fills defaults for a minimal card/board", () => {
    const restored = parseJson(
      JSON.stringify({
        board: { title: "Min" },
        columns: [{ id: "c1", title: "A", ord: "a0" }],
        cards: [{ id: "k1", title: "Card", columnId: "c1", ord: "a0" }],
      }),
    );
    expect(restored.board.shortIdPrefix).toBe("");
    expect(restored.cards[0]).toMatchObject({
      status: Status.Todo,
      priority: Priority.None,
      severity: null,
      dueDate: null,
      labelIds: [],
      archived: false,
    });
  });
});

describe("malformed import is atomic", () => {
  it("throws ImportError on non-JSON", () => {
    expect(() => parseJson("not json {")).toThrow(ImportError);
  });

  it("throws ImportError (with a path) when a required field is missing", () => {
    // card missing columnId
    const bad = JSON.stringify({
      board: { title: "B" },
      columns: [{ id: "c1", title: "A", ord: "a0" }],
      cards: [{ id: "k1", title: "Card", ord: "a0" }],
    });
    expect(() => parseJson(bad)).toThrow(ImportError);
    expect(() => parseJson(bad)).toThrow(/columnId/);
  });

  it("rejects an out-of-range priority", () => {
    const bad = JSON.stringify({
      board: { title: "B" },
      columns: [{ id: "c1", title: "A", ord: "a0" }],
      cards: [{ id: "k1", title: "Card", columnId: "c1", ord: "a0", priority: 9 }],
    });
    expect(() => parseJson(bad)).toThrow(ImportError);
  });
});

describe("Markdown export", () => {
  it("renders a readable outline with checked terminal cards", () => {
    const md = exportMarkdown(snapshot);
    expect(md).toContain("# Roadmap");
    expect(md).toContain("## To Do");
    expect(md).toContain("- [ ] Fix login");
    expect(md).toContain("## Doing");
    expect(md).toContain("- [x] Ship it"); // Done → checked
  });
});

describe("Obsidian-Kanban import", () => {
  const sample = [
    "---",
    "kanban-plugin: basic",
    "---",
    "",
    "# My Board",
    "",
    "## Backlog",
    "",
    "- [ ] Research options",
    "- [ ] Draft spec",
    "",
    "## In Progress",
    "",
    "- [ ] Build prototype",
    "",
    "## Done",
    "",
    "- [x] Kickoff meeting",
    "",
    "%% kanban:settings",
    '{"kanban-plugin":"basic"}',
    "%%",
  ].join("\n");

  it("maps ## headings to columns and tasks to cards in the right column", () => {
    const snap = parseObsidian(sample);
    expect(snap.board.title).toBe("My Board");
    expect(snap.columns.map((c) => c.title)).toEqual(["Backlog", "In Progress", "Done"]);

    const byColumn = (title: string) => {
      const col = snap.columns.find((c) => c.title === title)!;
      return snap.cards.filter((k) => k.columnId === col.id).map((k) => k.title);
    };
    expect(byColumn("Backlog")).toEqual(["Research options", "Draft spec"]);
    expect(byColumn("In Progress")).toEqual(["Build prototype"]);
    expect(byColumn("Done")).toEqual(["Kickoff meeting"]);
  });

  it("checked tasks become Done status; unchecked stay Todo", () => {
    const snap = parseObsidian(sample);
    const done = snap.cards.find((c) => c.title === "Kickoff meeting")!;
    const todo = snap.cards.find((c) => c.title === "Research options")!;
    expect(done.status).toBe(Status.Done);
    expect(todo.status).toBe(Status.Todo);
  });

  it("keeps cards ordered within a column", () => {
    const snap = parseObsidian(sample);
    const backlog = snap.columns.find((c) => c.title === "Backlog")!;
    const ords = snap.cards.filter((k) => k.columnId === backlog.id).map((k) => k.ord);
    expect([...ords].sort()).toEqual(ords); // already ascending
  });

  it("throws ImportError when there are no columns", () => {
    expect(() => parseObsidian("just some text\nno headings")).toThrow(ImportError);
  });
});
