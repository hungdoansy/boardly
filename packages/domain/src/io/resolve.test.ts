import { describe, expect, it } from "vitest";

import { slugify } from "../ids";
import {
  type ResolvableEntity,
  type ResolvedEntityKind,
  normalizeEntityName,
  resolveEntities,
  resolveImport,
} from "./resolve";

// ---------------------------------------------------------------------------
// Entity resolution — projects and labels obey the identical rule set (R10),
// so every structural case runs twice, once per kind.
// ---------------------------------------------------------------------------

const KINDS: readonly ResolvedEntityKind[] = ["project", "label"];

/** A file/board entity with a colour, to prove colours are never carried over. */
interface Coloured extends ResolvableEntity {
  color: string;
}

const entity = (
  id: string,
  name: string,
  ord: string,
  extra: Partial<Coloured> = {},
): Coloured => ({ id, name, ord, color: "#111111", ...extra });

describe("normalizeEntityName", () => {
  it("folds case, diacritics, and runs of separators", () => {
    expect(normalizeEntityName("Web App")).toBe("web-app");
    expect(normalizeEntityName("web  app")).toBe("web-app");
    expect(normalizeEntityName("  Wéb — App  ")).toBe("web-app");
  });

  it("is empty for names with no Latin alphanumerics", () => {
    expect(normalizeEntityName("日本語")).toBe("");
    expect(normalizeEntityName("🎉🎉")).toBe("");
    expect(normalizeEntityName("!!!")).toBe("");
    expect(normalizeEntityName("   ")).toBe("");
  });

  it("compares the whole name, not slugify's 60-character truncation", () => {
    const prefix = "x".repeat(58);
    const a = `${prefix} alpha`;
    const b = `${prefix} alphabet`;
    // The decorative slug truncates and would report these as the same name…
    expect(slugify(a)).toBe(slugify(b));
    // …the matching key must not.
    expect(normalizeEntityName(a)).not.toBe(normalizeEntityName(b));
  });
});

for (const kind of KINDS) {
  describe(`resolveEntities (${kind})`, () => {
    it("maps a file entity whose id exists on the board to itself, untouched", () => {
      const board = [entity("p1", "Marketing", "a1", { color: "#ff0000" })];
      const file = [entity("p1", "Renamed in the file", "a5", { color: "#00ff00" })];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("p1")).toBe("p1");
      expect(result.create).toEqual([]);
      expect(result.fusions).toEqual([]);
      // The board entity is returned to no-one and mutated by no-one: the caller
      // keeps its own name and colour.
      expect(board[0]).toEqual(entity("p1", "Marketing", "a1", { color: "#ff0000" }));
    });

    it("prefers an id match over a name match", () => {
      const board = [entity("p1", "Marketing", "a1"), entity("p2", "Web App", "a2")];
      const file = [entity("p1", "web app", "a5")];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("p1")).toBe("p1");
      expect(result.fusions).toEqual([]);
    });

    it("fuses a differently-punctuated name into the board entity and reports it", () => {
      const board = [entity("bp1", "Web App", "a1", { color: "#ff0000" })];
      const file = [entity("fp1", "web  app", "a9", { color: "#00ff00" })];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("fp1")).toBe("bp1");
      expect(result.create).toEqual([]);
      expect(result.fusions).toEqual([
        {
          kind,
          fromId: "fp1",
          fromName: "web  app",
          intoId: "bp1",
          intoName: "Web App",
          into: "board",
          nameKey: "web-app",
        },
      ]);
    });

    it("creates a new entity when only an archived board entity matches by name", () => {
      const board = [entity("bp1", "Web App", "a1", { archived: true })];
      const file = [entity("fp1", "web app", "a9")];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("fp1")).toBe("fp1");
      expect(result.create.map((e) => e.id)).toEqual(["fp1"]);
      expect(result.fusions).toEqual([]);
      // R11: the archived entity is not revived, renamed, or otherwise touched.
      expect(board[0]).toEqual(entity("bp1", "Web App", "a1", { archived: true }));
    });

    it("creates a file entity that matches nothing", () => {
      const board = [entity("bp1", "Marketing", "a1")];
      const file = [entity("fp1", "Web App", "a9")];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("fp1")).toBe("fp1");
      expect(result.create.map((e) => e.id)).toEqual(["fp1"]);
      expect(result.fusions).toEqual([]);
    });

    it("lets a still-archived file entity fuse into an active board entity", () => {
      const board = [entity("bp1", "Web App", "a1")];
      const file = [entity("fp1", "web app", "a9", { archived: true })];

      const result = resolveEntities(kind, file, board);

      // R11: nothing here asks the board entity to become archived — the file
      // entity simply ceases to exist as a separate thing.
      expect(result.remap.get("fp1")).toBe("bp1");
      expect(result.create).toEqual([]);
      expect(result.fusions.map((f) => f.intoId)).toEqual(["bp1"]);
    });

    it("breaks a multi-way board-side name tie on the lowest ord, stably", () => {
      const board = [
        entity("bp-late", "Web App", "a3"),
        entity("bp-early", "web app", "a1"),
        entity("bp-mid", "WEB APP", "a2"),
      ];
      const file = [entity("fp1", "Web app", "a9")];

      const first = resolveEntities(kind, file, board);
      const second = resolveEntities(kind, file, board);
      const reversed = resolveEntities(kind, file, [...board].reverse());

      expect(first.remap.get("fp1")).toBe("bp-early");
      expect(second.remap.get("fp1")).toBe("bp-early");
      // Input order must not decide it — every replica reads the same set in a
      // different order.
      expect(reversed.remap.get("fp1")).toBe("bp-early");
    });

    it("breaks an ord tie on the lowest id", () => {
      const board = [entity("zzz", "Web App", "a1"), entity("aaa", "web app", "a1")];
      const file = [entity("fp1", "Web app", "a9")];

      expect(resolveEntities(kind, file, board).remap.get("fp1")).toBe("aaa");
      expect(resolveEntities(kind, file, [...board].reverse()).remap.get("fp1")).toBe("aaa");
    });

    it("never fuses a name that normalizes to nothing — with the board", () => {
      const board = [entity("bp1", "日本語", "a1"), entity("bp2", "🎉", "a2")];
      const file = [entity("fp1", "한국어", "a9"), entity("fp2", "🚀", "b0")];

      const result = resolveEntities(kind, file, board);

      expect(result.create.map((e) => e.id)).toEqual(["fp1", "fp2"]);
      expect(result.fusions).toEqual([]);
    });

    it("never fuses a name that normalizes to nothing — with another file entity", () => {
      const file = [
        entity("fp1", "日本語", "a1"),
        entity("fp2", "🎉🎉", "a2"),
        entity("fp3", "!!!", "a3"),
      ];

      const result = resolveEntities(kind, file, []);

      expect(result.create.map((e) => e.id)).toEqual(["fp1", "fp2", "fp3"]);
      expect(result.fusions).toEqual([]);
    });

    it("does not fuse long names that share a 60-character prefix", () => {
      const prefix = "x".repeat(58);
      const board = [entity("bp1", `${prefix} alpha`, "a1")];
      const file = [entity("fp1", `${prefix} alphabet`, "a9")];

      const result = resolveEntities(kind, file, board);

      expect(result.create.map((e) => e.id)).toEqual(["fp1"]);
      expect(result.fusions).toEqual([]);
    });

    it("fuses two file entities that normalize alike into the same board entity", () => {
      const board = [entity("bp1", "Web App", "a1")];
      const file = [entity("fp1", "web app", "a8"), entity("fp2", "WEB  APP", "a9")];

      const result = resolveEntities(kind, file, board);

      expect(result.remap.get("fp1")).toBe("bp1");
      expect(result.remap.get("fp2")).toBe("bp1");
      expect(result.create).toEqual([]);
      // Every collapse is reported — both of them.
      expect(result.fusions.map((f) => [f.fromId, f.intoId, f.into])).toEqual([
        ["fp1", "bp1", "board"],
        ["fp2", "bp1", "board"],
      ]);
    });

    it("fuses a later file entity into one created earlier in the same file", () => {
      const file = [entity("fp1", "Web App", "a8"), entity("fp2", "web  app", "a9")];

      const result = resolveEntities(kind, file, []);

      // The board set grows as entities are created, so the file cannot
      // reproduce the duplicate this rule exists to prevent.
      expect(result.create.map((e) => e.id)).toEqual(["fp1"]);
      expect(result.remap.get("fp1")).toBe("fp1");
      expect(result.remap.get("fp2")).toBe("fp1");
      expect(result.fusions).toEqual([
        {
          kind,
          fromId: "fp2",
          fromName: "web  app",
          intoId: "fp1",
          intoName: "Web App",
          into: "created",
          nameKey: "web-app",
        },
      ]);
    });

    it("does not let an archived created entity attract later fusions", () => {
      const file = [
        entity("fp1", "Web App", "a8", { archived: true }),
        entity("fp2", "web app", "a9"),
      ];

      const result = resolveEntities(kind, file, []);

      expect(result.create.map((e) => e.id)).toEqual(["fp1", "fp2"]);
      expect(result.fusions).toEqual([]);
    });

    it("returns the file entity itself in the creation list, colour and all", () => {
      const file = [entity("fp1", "Web App", "a9", { color: "#abcdef" })];

      const result = resolveEntities(kind, file, []);

      expect(result.create).toEqual([{ id: "fp1", name: "Web App", ord: "a9", color: "#abcdef" }]);
    });

    it("treats a repeated file id as one entity", () => {
      const file = [entity("fp1", "Web App", "a8"), entity("fp1", "Something else", "a9")];

      const result = resolveEntities(kind, file, []);

      expect(result.create.map((e) => e.name)).toEqual(["Web App"]);
      expect(result.remap.get("fp1")).toBe("fp1");
    });

    it("resolves an empty file against an empty board", () => {
      const result = resolveEntities(kind, [], []);

      expect(result.remap.size).toBe(0);
      expect(result.create).toEqual([]);
      expect(result.fusions).toEqual([]);
    });
  });
}

// ---------------------------------------------------------------------------
// Card-level references (R13)
// ---------------------------------------------------------------------------

describe("resolveImport — card references", () => {
  it("repoints a card's project and labels through the remap, de-duplicating fusions", () => {
    const result = resolveImport({
      file: {
        projects: [{ id: "fp1", name: "web  app", ord: "a9" }],
        labels: [
          { id: "fl1", name: "Bug", ord: "a8" },
          { id: "fl2", name: "BUG", ord: "a9" },
        ],
        cards: [{ id: "c1", projectId: "fp1", labelIds: ["fl1", "fl2"] }],
      },
      board: {
        projects: [{ id: "bp1", name: "Web App", ord: "a1" }],
        labels: [{ id: "bl1", name: "bug", ord: "a1" }],
      },
    });

    expect(result.cards.get("c1")).toEqual({ projectId: "bp1", labelIds: ["bl1"], relatedIds: [] });
    expect(result.dropped).toEqual([]);
    // Both label fusions are still reported even though the card shows one label.
    expect(result.fusions.map((f) => f.fromId)).toEqual(["fp1", "fl1", "fl2"]);
  });

  it("keeps a reference to a board entity the file never mentions", () => {
    const result = resolveImport({
      file: {
        cards: [{ id: "c1", projectId: "bp2", labelIds: ["bl2"] }],
      },
      board: {
        projects: [{ id: "bp2", name: "Marketing", ord: "a1" }],
        labels: [{ id: "bl2", name: "Chore", ord: "a1" }],
      },
    });

    expect(result.cards.get("c1")).toEqual({ projectId: "bp2", labelIds: ["bl2"], relatedIds: [] });
    expect(result.dropped).toEqual([]);
  });

  it("keeps a reference to an archived board entity", () => {
    const result = resolveImport({
      file: { cards: [{ id: "c1", projectId: "bp2" }] },
      board: { projects: [{ id: "bp2", name: "Marketing", ord: "a1", archived: true }] },
    });

    expect(result.cards.get("c1")?.projectId).toBe("bp2");
    expect(result.dropped).toEqual([]);
  });

  it("drops a projectId present in neither the file nor the board, and counts it", () => {
    const result = resolveImport({
      file: { cards: [{ id: "c1", projectId: "ghost", labelIds: ["phantom"] }] },
      board: {},
    });

    expect(result.cards.get("c1")).toEqual({ labelIds: [], relatedIds: [] });
    expect(result.cards.get("c1")?.projectId).toBeUndefined();
    expect(result.dropped).toEqual([
      { cardId: "c1", field: "projectId", value: "ghost" },
      { cardId: "c1", field: "labelIds", value: "phantom" },
    ]);
  });

  it("keeps relatedIds pointing at an imported or existing card and drops the rest", () => {
    const result = resolveImport({
      file: {
        cards: [
          { id: "c1", relatedIds: ["c2", "bc1", "ghost"] },
          { id: "c2", relatedIds: ["c1"] },
        ],
      },
      board: { cardIds: ["bc1"] },
    });

    expect(result.cards.get("c1")?.relatedIds).toEqual(["c2", "bc1"]);
    expect(result.cards.get("c2")?.relatedIds).toEqual(["c1"]);
    expect(result.dropped).toEqual([{ cardId: "c1", field: "relatedIds", value: "ghost" }]);
  });

  it("leaves assigneeId alone when the caller supplies no member list", () => {
    const result = resolveImport({
      file: { cards: [{ id: "c1", assigneeId: "u9" }] },
      board: {},
    });

    expect(result.cards.get("c1")?.assigneeId).toBe("u9");
    expect(result.dropped).toEqual([]);
  });

  it("drops an assigneeId absent from a supplied member list", () => {
    const result = resolveImport({
      file: {
        cards: [
          { id: "c1", assigneeId: "u9" },
          { id: "c2", assigneeId: "u1" },
        ],
      },
      board: { memberIds: ["u1"] },
    });

    expect(result.cards.get("c1")?.assigneeId).toBeUndefined();
    expect(result.cards.get("c2")?.assigneeId).toBe("u1");
    expect(result.dropped).toEqual([{ cardId: "c1", field: "assigneeId", value: "u9" }]);
  });

  it("never reports an archived state for a card", () => {
    const result = resolveImport({
      file: {
        cards: [{ id: "c1", projectId: "fp1" }],
        projects: [{ id: "fp1", name: "X", ord: "a1" }],
      },
      board: {},
    });

    // R11: resolution decides ids, never lifecycle. Nothing here can flip a
    // card's archived flag because nothing here mentions it.
    expect(Object.keys(result.cards.get("c1") ?? {}).sort()).toEqual([
      "labelIds",
      "projectId",
      "relatedIds",
    ]);
  });

  it("resolves every card, including ones with no references at all", () => {
    const result = resolveImport({ file: { cards: [{ id: "c1" }] }, board: {} });

    expect(result.cards.get("c1")).toEqual({ labelIds: [], relatedIds: [] });
  });

  it("returns empty resolutions for an empty file", () => {
    const result = resolveImport({ file: {}, board: {} });

    expect(result.cards.size).toBe(0);
    expect(result.projects.create).toEqual([]);
    expect(result.labels.create).toEqual([]);
    expect(result.fusions).toEqual([]);
    expect(result.dropped).toEqual([]);
  });
});
