import { describe, expect, it } from "vitest";

import { Priority } from "../enums";
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
  cards: [
    {
      id: "k1",
      number: 1,
      title: "Fix login",
      description: "steps",
      ord: "a0",
      status: Status.Todo,
      priority: Priority.High,
      dueDate: { at: 1_700_000_000_000, hasTime: false },
      labelIds: ["l1"],
      relatedIds: ["k2"],
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
      ord: "a0",
      status: Status.Done,
      priority: Priority.None,
      dueDate: null,
      labelIds: [],
      relatedIds: ["k1"],
      checklist: [],
      links: [],
      archived: false,
      createdAt: 3,
      updatedAt: 4,
    },
  ],
};

describe("JSON round-trip", () => {
  it("export → parse reproduces the snapshot exactly (cards, status, order, labels, fields)", () => {
    const restored = parseJson(exportJson(snapshot));
    expect(restored).toEqual(snapshot);
  });

  it("fills defaults for a minimal card/board", () => {
    const restored = parseJson(
      JSON.stringify({
        board: { title: "Min" },
        cards: [{ id: "k1", title: "Card", ord: "a0" }],
      }),
    );
    expect(restored.board.shortIdPrefix).toBe("");
    expect(restored.cards[0]).toMatchObject({
      status: Status.Todo,
      priority: Priority.None,
      dueDate: null,
      labelIds: [],
      archived: false,
    });
    expect(restored.cards[0]).not.toHaveProperty("severity");
  });
});

describe("malformed import is atomic", () => {
  it("throws ImportError on non-JSON", () => {
    expect(() => parseJson("not json {")).toThrow(ImportError);
  });

  it("throws ImportError (with a path) when a required field is missing", () => {
    // card missing ord
    const bad = JSON.stringify({
      board: { title: "B" },
      cards: [{ id: "k1", title: "Card" }],
    });
    expect(() => parseJson(bad)).toThrow(ImportError);
    expect(() => parseJson(bad)).toThrow(/ord/);
  });

  it("rejects an out-of-range priority", () => {
    const bad = JSON.stringify({
      board: { title: "B" },
      cards: [{ id: "k1", title: "Card", ord: "a0", priority: 9 }],
    });
    expect(() => parseJson(bad)).toThrow(ImportError);
  });
});

describe("Markdown export", () => {
  it("renders a readable outline grouped by status, checking terminal cards", () => {
    const md = exportMarkdown(snapshot);
    expect(md).toContain("# Roadmap");
    expect(md).toContain("## Todo");
    expect(md).toContain("- [ ] Fix login");
    expect(md).toContain("## Done");
    expect(md).toContain("- [x] Ship it"); // Done → checked
    // Empty status sections are omitted.
    expect(md).not.toContain("## Backlog");
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

  it("maps ## headings to statuses (by name) and unchecked tasks to that status", () => {
    const snap = parseObsidian(sample);
    expect(snap.board.title).toBe("My Board");
    const statusOf = (title: string) => snap.cards.find((c) => c.title === title)!.status;
    expect(statusOf("Research options")).toBe(Status.Backlog);
    expect(statusOf("Draft spec")).toBe(Status.Backlog);
    expect(statusOf("Build prototype")).toBe(Status.InProgress);
  });

  it("checked tasks become Done status regardless of section", () => {
    const snap = parseObsidian(sample);
    expect(snap.cards.find((c) => c.title === "Kickoff meeting")!.status).toBe(Status.Done);
    expect(snap.cards.find((c) => c.title === "Research options")!.status).toBe(Status.Backlog);
  });

  it("cards under an unknown heading default to Todo", () => {
    const snap = parseObsidian(["## Icebox", "- [ ] Someday"].join("\n"));
    expect(snap.cards[0]!.status).toBe(Status.Todo);
  });

  it("keeps cards ordered within a status", () => {
    const snap = parseObsidian(sample);
    const ords = snap.cards.filter((k) => k.status === Status.Backlog).map((k) => k.ord);
    expect([...ords].sort()).toEqual(ords); // already ascending
  });

  it("throws ImportError when there are no sections", () => {
    expect(() => parseObsidian("just some text\nno headings")).toThrow(ImportError);
  });
});
