import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Priority } from "../enums";
import { Status } from "../status";
import { exportJson, parseJson } from "./json";
import { exportMarkdown } from "./markdown";
import { parseObsidian } from "./obsidian";
import { type BoardSnapshot, ImportError, SNAPSHOT_VERSION } from "./snapshot";

/** Read a committed interchange file verbatim (v1 = pre-projects, v2 = current). */
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const snapshot: BoardSnapshot = {
  version: SNAPSHOT_VERSION,
  board: {
    title: "Roadmap",
    icon: "🗺️",
    description: "Q3 plan",
    shortIdPrefix: "RDM",
    badgeConfig: ["priority", "status"],
    showEmptyColumns: false,
    zoom: 1.25,
  },
  projects: [
    { id: "p1", name: "Web", color: "#4EA7FC", ord: "a0", archived: false },
    { id: "p2", name: "Sunset", color: "#8A8F98", ord: "a1", archived: true, deletedAt: 9 },
  ],
  labels: [{ id: "l1", name: "bug", color: "#eb5757", ord: "a0" }],
  views: [
    {
      id: "v1",
      name: "Web bugs",
      filter: {
        op: "and",
        clauses: [
          { field: "project", condition: "is", values: ["p1"] },
          { op: "or", clauses: [{ field: "label", condition: "hasAny", values: ["l1"] }] },
        ],
      },
      sort: { field: "priority", direction: "desc" },
      groupBy: "status",
      layout: "board",
      visibleBadges: ["priority"],
    },
  ],
  cards: [
    {
      id: "k1",
      number: 1,
      title: "Fix login",
      description: "steps",
      projectId: "p1",
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
    {
      id: "k3",
      number: 3,
      title: "Retired idea",
      description: "",
      projectId: "p2",
      ord: "a1",
      status: Status.Canceled,
      priority: Priority.None,
      dueDate: null,
      labelIds: [],
      relatedIds: [],
      checklist: [],
      links: [],
      archived: true,
      deletedAt: 9,
      createdAt: 5,
      updatedAt: 6,
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
    // card missing title (`ord` is optional since v2 — see R23 below)
    const bad = JSON.stringify({
      board: { title: "B" },
      cards: [{ id: "k1", ord: "a0" }],
    });
    expect(() => parseJson(bad)).toThrow(ImportError);
    expect(() => parseJson(bad)).toThrow(/title/);
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

  it("stays a structural outline: archived cards and the new v2 sections are absent", () => {
    const md = exportMarkdown(snapshot);
    expect(md).not.toContain("Retired idea"); // archived
    expect(md).not.toContain("Web"); // projects are not represented
    expect(md).not.toContain("Web bugs"); // neither are saved views
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

describe("v2 carries the whole board (R1)", () => {
  it("round-trips projects, per-card project, saved views, prefs and archived cards", () => {
    const restored = parseJson(exportJson(snapshot));
    expect(restored.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(restored.projects[1]).toMatchObject({ archived: true, deletedAt: 9 });
    expect(restored.cards.find((c) => c.id === "k1")?.projectId).toBe("p1");
    expect(restored.views).toEqual(snapshot.views);
    expect(restored.board.showEmptyColumns).toBe(false);
    expect(restored.board.zoom).toBe(1.25);
    const archived = restored.cards.find((c) => c.id === "k3");
    expect(archived).toMatchObject({ archived: true, deletedAt: 9, projectId: "p2" });
  });

  it("parses the committed v2 fixture with every section intact", () => {
    const snap = parseJson(fixture("board-v2.json"));
    expect(snap.version).toBe(2);
    expect(snap.board).toMatchObject({ showEmptyColumns: false, zoom: 1.25 });
    expect(snap.projects.map((p) => p.name)).toEqual(["Web", "Sunset"]);
    expect(snap.projects[1]?.archived).toBe(true);
    expect(snap.views[0]?.name).toBe("Web bugs");
    expect(snap.views[0]?.filter.clauses[0]).toEqual({
      field: "project",
      condition: "is",
      values: ["p-web"],
    });
    expect(snap.cards.find((c) => c.id === "c-1")?.projectId).toBe("p-web");
    expect(snap.cards.find((c) => c.id === "c-2")).toMatchObject({
      archived: true,
      deletedAt: 1700000900000,
    });
  });

  it("SNAPSHOT_VERSION is 2 and export stamps it", () => {
    expect(SNAPSHOT_VERSION).toBe(2);
    expect((JSON.parse(exportJson(snapshot)) as { version: number }).version).toBe(2);
  });
});

describe("older files still import (R2)", () => {
  it("parses the committed v1 fixture: no projects, no views, no card project", () => {
    const snap = parseJson(fixture("board-v1.json"));
    expect(snap.version).toBe(1);
    expect(snap.projects).toEqual([]);
    expect(snap.views).toEqual([]);
    expect(snap.cards).toHaveLength(2);
    expect(snap.cards.every((c) => c.projectId === undefined)).toBe(true);
    // Sections v1 predates are absent, not errors — they take their defaults.
    expect(snap.board.showEmptyColumns).toBe(true);
    expect(snap.board.zoom).toBe(1);
    // Everything v1 *did* carry survives untouched.
    expect(snap.board.title).toBe("Legacy board");
    expect(snap.cards[0]).toMatchObject({ id: "c-old-1", labelIds: ["l-chore"], ord: "a0" });
  });

  it("a file with no version key at all parses as the current version", () => {
    const snap = parseJson(
      JSON.stringify({ board: { title: "No version" }, cards: [{ id: "k1", title: "C" }] }),
    );
    expect(snap.version).toBe(SNAPSHOT_VERSION);
  });
});

describe("a file from a newer build is rejected (R3)", () => {
  it("throws ImportError naming the version and returns nothing", () => {
    const future = JSON.stringify({ version: 99, board: { title: "From the future" }, cards: [] });
    expect(() => parseJson(future)).toThrow(ImportError);
    expect(() => parseJson(future)).toThrow(/99/);
    // The build's own version is named too, so the message says what is supported.
    expect(() => parseJson(future)).toThrow(new RegExp(String(SNAPSHOT_VERSION)));
  });

  it("rejects the version before reading any section, so nothing is partially read", () => {
    let result: unknown = "untouched";
    try {
      result = parseJson(
        JSON.stringify({
          version: 3,
          board: { title: "B" },
          cards: [{ id: "k1", title: "C", ord: "a0" }],
        }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
    }
    expect(result).toBe("untouched");
  });

  it("non-JSON text throws before any schema work", () => {
    expect(() => parseJson("not json {")).toThrow(ImportError);
    expect(() => parseJson("not json {")).toThrow(/not valid JSON/);
  });
});

describe("a snapshot is authorable by hand (R23)", () => {
  it("parses a snapshot whose cards and labels carry no ord", () => {
    const snap = parseJson(
      JSON.stringify({
        version: 2,
        board: { title: "Hand-authored" },
        projects: [{ id: "p1", name: "Web", color: "#4EA7FC" }],
        labels: [{ id: "l1", name: "bug", color: "#EB5757" }],
        cards: [
          { id: "k1", title: "First", projectId: "p1" },
          { id: "k2", title: "Second" },
        ],
      }),
    );
    expect(snap.cards.map((c) => c.ord)).toEqual([undefined, undefined]);
    expect(snap.labels[0]?.ord).toBeUndefined();
    expect(snap.projects[0]?.ord).toBeUndefined();
    // The rest still gets its defaults.
    expect(snap.cards[0]).toMatchObject({ status: Status.Todo, archived: false, number: 0 });
  });

  it("ignores unknown extra fields on a card rather than throwing", () => {
    const snap = parseJson(
      JSON.stringify({
        board: { title: "B" },
        cards: [{ id: "k1", title: "C", ord: "a0", severity: "high", futureField: { a: 1 } }],
      }),
    );
    expect(snap.cards[0]).not.toHaveProperty("severity");
    expect(snap.cards[0]).not.toHaveProperty("futureField");
    expect(snap.cards[0]?.title).toBe("C");
  });
});
