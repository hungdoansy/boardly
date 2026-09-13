import { boardSnapshotSchema } from "@boardly/domain";
import { cardsInStatus, getBoard, initBoard, listArchivedCards } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";

import { catalog, commands, getCommand, listCommandNames } from "./catalog";
import { execute } from "./command";
import { addLink } from "./commands/link";
import { archiveCard, createCard, moveCard, renameCard, unarchiveCard } from "./commands/card";
import { ImportError, exportBoard, importBoard } from "./commands/io";
import { setCardStatus } from "./commands/status";
import { type CommandContext, createMemoryContext } from "./context";

describe("catalog", () => {
  it("registers every command uniquely by name", () => {
    const names = listCommandNames();
    expect(new Set(names).size).toBe(names.length);
    expect(getCommand("createCard")).toBeDefined();
    expect(Object.keys(catalog)).toHaveLength(commands.length);
  });

  it("has no board-entity commands", () => {
    expect(getCommand("createBoard")).toBeUndefined();
    expect(getCommand("listBoards")).toBeUndefined();
    expect(getCommand("archiveBoard")).toBeUndefined();
  });

  it("has no column commands (status is the single placement axis)", () => {
    expect(getCommand("addColumn")).toBeUndefined();
    expect(getCommand("renameColumn")).toBeUndefined();
    expect(getCommand("moveColumn")).toBeUndefined();
    expect(getCommand("archiveColumn")).toBeUndefined();
    expect(getCommand("setColumnWipLimit")).toBeUndefined();
  });

  it("registers setShowEmptyColumns", () => {
    expect(getCommand("setShowEmptyColumns")).toBeDefined();
  });

  it("registers setZoom", () => {
    expect(getCommand("setZoom")).toBeDefined();
  });

  it("registers the bulk archiveCards command", () => {
    expect(getCommand("archiveCards")).toBeDefined();
  });

  it("registers the bulk setCardsStatus command", () => {
    expect(getCommand("setCardsStatus")).toBeDefined();
    expect(listCommandNames()).toContain("setCardsStatus");
  });

  it("registers the related-card commands", () => {
    expect(getCommand("addRelatedCard")).toBeDefined();
    expect(getCommand("removeRelatedCard")).toBeDefined();
  });

  it("registers deleteCard (hard delete) alongside archiveCard", () => {
    expect(getCommand("deleteCard")).toBeDefined();
    expect(getCommand("archiveCard")).toBeDefined();
  });

  it("registers unarchiveCard (restore) so the agent surface has archive parity", () => {
    expect(getCommand("unarchiveCard")).toBeDefined();
    expect(listCommandNames()).toContain("unarchiveCard");
  });
});

describe("commands (single per-user doc)", () => {
  it("runs core mutations and returns JSON-serializable results", () => {
    const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });

    const card = execute(createCard, ctx, { id: "c1", title: "Card 1" });
    expect(card?.shortId).toBe("#1");
    expect(card?.status).toBe("todo");

    const withStatus = execute(setCardStatus, ctx, { cardId: "c1", status: "in_progress" });
    expect(withStatus?.status).toBe("in_progress");

    const linked = execute(addLink, ctx, {
      cardId: "c1",
      id: "l1",
      url: "https://linear.app/acme/issue/ABC-1/title",
    });
    expect(linked.card?.links[0]?.provider).toBe("linear");

    const moved = execute(moveCard, ctx, { cardId: "c1", toStatus: "done" });
    expect(moved?.status).toBe("done");

    expect(() => JSON.stringify({ card, withStatus, linked, moved })).not.toThrow();
  });

  it("rejects invalid input via zod before mutating", () => {
    const ctx = createMemoryContext();

    const before = cardsInStatus(ctx.getBoardDoc(), "todo").length;
    expect(() => execute(createCard, ctx, { title: "" })).toThrow(ZodError);
    const after = cardsInStatus(ctx.getBoardDoc(), "todo").length;
    expect(after).toBe(before);
  });

  it("archiveCard then unarchiveCard round-trips a card off and back onto the board", () => {
    const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
    execute(createCard, ctx, { id: "c1", title: "Card 1" });

    execute(archiveCard, ctx, { cardId: "c1" });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo")).toEqual([]);
    expect(listArchivedCards(ctx.getBoardDoc()).map((c) => c.id)).toEqual(["c1"]);

    const restored = execute(unarchiveCard, ctx, { cardId: "c1" });
    expect(restored).toEqual({ id: "c1", archived: false });
    expect(listArchivedCards(ctx.getBoardDoc())).toEqual([]);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["c1"]);
  });

  it("rejects unarchiveCard with missing cardId via zod", () => {
    const ctx = createMemoryContext();
    expect(() => execute(unarchiveCard, ctx, {} as never)).toThrow(ZodError);
  });
});

describe("export / import commands", () => {
  const seed = (userId: string, now = 100) => {
    const ctx = createMemoryContext({ userId, clientId: `c-${userId}`, now: () => now });
    initBoard(ctx.getBoardDoc(), { title: "Source", now });
    return ctx;
  };

  it("exports the board and imports the snapshot into another user's doc (round-trip)", () => {
    const src = seed("src");
    execute(createCard, src, { id: "k1", title: "Task" });
    execute(setCardStatus, src, { cardId: "k1", status: "in_progress" });

    const snapshot = execute(exportBoard, src, {});
    expect(snapshot.cards[0]).toMatchObject({ title: "Task", status: "in_progress" });

    // Import into a fresh (different user's) empty doc.
    const dst = createMemoryContext({ userId: "dst", clientId: "c2", now: () => 100 });
    const result = execute(importBoard, dst, {
      snapshot,
      mode: "replace",
      acknowledgeReplace: true,
    });
    expect(result.mode).toBe("replace");
    expect(result.cards).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(cardsInStatus(dst.getBoardDoc(), "in_progress")[0]?.title).toBe("Task");
  });

  it("accepts each of the three modes", () => {
    for (const mode of ["replace", "merge", "copy"] as const) {
      const ctx = seed(`m-${mode}`);
      const snapshot = execute(exportBoard, ctx, {});
      const input = { snapshot, mode, ...(mode === "replace" ? { acknowledgeReplace: true } : {}) };
      expect(execute(importBoard, ctx, input).mode).toBe(mode);
    }
  });

  it("rejects an unknown mode before touching the doc", () => {
    const ctx = seed("unknown-mode");
    const snapshot = execute(exportBoard, ctx, {});
    expect(() => execute(importBoard, ctx, { snapshot, mode: "overwrite" } as never)).toThrow(
      ZodError,
    );
    expect(getBoard(ctx.getBoardDoc(), "unknown-mode").title).toBe("Source");
  });

  it("rejects an omitted mode rather than picking one (AE8, R22)", () => {
    const ctx = seed("no-mode");
    const snapshot = execute(exportBoard, ctx, {});
    // The pre-UNIT-21 call shape, which used to run an unannounced replace.
    expect(() => execute(importBoard, ctx, { snapshot } as never)).toThrow(ZodError);
  });

  it("rejects replace without acknowledgeReplace, before any write (KTD9)", () => {
    const ctx = seed("ack");
    execute(createCard, ctx, { id: "keep", title: "Still here" });
    const snapshot = boardSnapshotSchema.parse({ board: { title: "Incoming" }, cards: [] });

    expect(() => execute(importBoard, ctx, { snapshot, mode: "replace" } as never)).toThrow(
      ZodError,
    );
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.title)).toEqual(["Still here"]);
  });

  it("rejects a malformed snapshot via zod (nothing created)", () => {
    const ctx = createMemoryContext();
    expect(() =>
      execute(importBoard, ctx, { snapshot: { board: {} }, mode: "merge" } as never),
    ).toThrow(ZodError);
  });

  it("reports what it did on a mixed create / update / stale-skip file (R17)", () => {
    const ctx = seed("mixed", 100);
    execute(createCard, ctx, { id: "shared", title: "On both" });
    execute(createCard, ctx, { id: "older", title: "Board is newer" });
    execute(renameCard, ctx, { cardId: "older", title: "Edited on the board" });

    const snapshot = boardSnapshotSchema.parse({
      board: { title: "x" },
      labels: [{ id: "l-new", name: "chore", color: "#26b5ce" }],
      cards: [
        { id: "shared", title: "Renamed by the file", status: "todo", updatedAt: 500 },
        { id: "older", title: "Stale", status: "todo", updatedAt: 1 },
        { id: "brand-new", title: "From the file", status: "todo", updatedAt: 500 },
        { id: "dangling", title: "Bad ref", status: "todo", projectId: "ghost", updatedAt: 500 },
      ],
    });

    const result = execute(importBoard, ctx, { snapshot, mode: "merge" });

    expect(result.cards).toEqual({ created: 2, updated: 1, skipped: 1 });
    expect(result.labels).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.stale).toEqual([
      { cardId: "older", title: "Edited on the board", fileUpdatedAt: 1, boardUpdatedAt: 100 },
    ]);
    expect(result.dropped).toEqual([{ cardId: "dangling", field: "projectId", value: "ghost" }]);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.title)).toEqual([
      "Renamed by the file",
      "Edited on the board",
      "From the file",
      "Bad ref",
    ]);
  });

  it("surfaces an import failure as an ImportError, with the board untouched (R21, R25)", () => {
    const ctx = seed("throws");
    execute(createCard, ctx, { id: "keep", title: "Still here" });
    // A malformed fractional key: the first card writes, generating a key for
    // the second throws. Staged, so nothing reaches the live doc.
    const snapshot = boardSnapshotSchema.parse({
      board: { title: "Never lands" },
      cards: [
        { id: "a", title: "A", status: "todo", ord: "!!!" },
        { id: "b", title: "B", status: "todo" },
      ],
    });

    expect(() =>
      execute(importBoard, ctx, { snapshot, mode: "replace", acknowledgeReplace: true }),
    ).toThrow(ImportError);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.title)).toEqual(["Still here"]);
  });
});

// The agent surface is generated from this schema, so these assertions are the
// contract an MCP/REST caller actually sees (KTD1, KTD9, R22, R23, R24).
describe("importBoard generated schema", () => {
  const schema = z.toJSONSchema(importBoard.input, { io: "input" }) as {
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
  };

  it("requires mode, with no default and exactly the three modes", () => {
    expect(schema.required).toContain("mode");
    const mode = schema.properties?.mode;
    expect(mode?.enum).toEqual(["replace", "merge", "copy"]);
    expect(mode).not.toHaveProperty("default");
  });

  it("carries the per-mode risk language a caller cannot get anywhere else (R24)", () => {
    const description = String(schema.properties?.mode?.description ?? "");
    expect(description).toContain("acknowledgeReplace: true");
    for (const mode of ["replace", "merge", "copy"]) expect(description).toContain(`"${mode}"`);
  });

  it("advertises acknowledgeReplace as a const, and never as required (KTD9)", () => {
    expect(schema.properties?.acknowledgeReplace).toMatchObject({ const: true });
    expect(schema.required ?? []).not.toContain("acknowledgeReplace");
  });

  it("does not require a snapshot field the author can leave to the writer (R23)", () => {
    // Input mode: zod's default output mode lists every defaulted field as
    // required, which would invert the authorable-snapshot promise.
    const snapshot = schema.properties?.snapshot as { required?: string[] } | undefined;
    expect(snapshot?.required).toEqual(["board"]);
  });
});

describe("parity", () => {
  function runScript(ctx: CommandContext): void {
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
    execute(createCard, ctx, { id: "c1", title: "Card 1" });
    execute(createCard, ctx, { id: "c2", title: "Card 2" });
    execute(moveCard, ctx, { cardId: "c1", toStatus: "in_progress" });
    execute(setCardStatus, ctx, { cardId: "c2", status: "done" });
    execute(addLink, ctx, {
      cardId: "c2",
      id: "l1",
      url: "https://linear.app/acme/issue/ABC-9/x",
    });
    execute(archiveCard, ctx, { cardId: "c1" });
  }

  function snapshot(ctx: CommandContext) {
    const doc = ctx.getBoardDoc();
    return {
      board: getBoard(doc, ctx.userId ?? "me"),
      todo: cardsInStatus(doc, "todo"),
      inProgress: cardsInStatus(doc, "in_progress"),
      done: cardsInStatus(doc, "done"),
    };
  }

  it("a client context and a server-style context produce identical state", () => {
    // Both are in-memory here; the real server uses a Hocuspocus direct
    // connection. Same inputs + injected clientId/now → same state, one doc.
    const client = createMemoryContext({ clientId: "same", now: () => 100 });
    const server = createMemoryContext({ clientId: "same", now: () => 100 });
    runScript(client);
    runScript(server);
    expect(snapshot(client)).toEqual(snapshot(server));
  });
});
