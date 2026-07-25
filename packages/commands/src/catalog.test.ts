import { cardsInStatus, getBoard, initBoard, listArchivedCards } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { catalog, commands, getCommand, listCommandNames } from "./catalog";
import { execute } from "./command";
import { addLink } from "./commands/link";
import { archiveCard, createCard, moveCard, unarchiveCard } from "./commands/card";
import { exportBoard, importBoard } from "./commands/io";
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
  it("exports the board and imports the snapshot into another user's doc (round-trip)", () => {
    const src = createMemoryContext({ userId: "src", clientId: "c1", now: () => 100 });
    initBoard(src.getBoardDoc(), { title: "Source", now: 100 });
    execute(createCard, src, { id: "k1", title: "Task" });
    execute(setCardStatus, src, { cardId: "k1", status: "in_progress" });

    const snapshot = execute(exportBoard, src, {});
    expect(snapshot.cards[0]).toMatchObject({ title: "Task", status: "in_progress" });

    // Import into a fresh (different user's) empty doc.
    const dst = createMemoryContext({ userId: "dst", clientId: "c2", now: () => 100 });
    const imported = execute(importBoard, dst, { snapshot });
    expect(imported.id).toBe("dst");
    expect(cardsInStatus(dst.getBoardDoc(), "in_progress")[0]?.title).toBe("Task");
  });

  it("rejects a malformed snapshot via zod (nothing created)", () => {
    const ctx = createMemoryContext();
    expect(() => execute(importBoard, ctx, { snapshot: { board: {} } as never })).toThrow(ZodError);
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
