import { cardsInColumn, getBoard, initBoard, liveColumns } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { catalog, commands, getCommand, listCommandNames } from "./catalog";
import { execute } from "./command";
import { addLink } from "./commands/link";
import { archiveCard, createCard, moveCard } from "./commands/card";
import { addColumn, renameColumn } from "./commands/column";
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
});

describe("commands (single per-user doc)", () => {
  it("runs core mutations and returns JSON-serializable results", () => {
    const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });

    execute(addColumn, ctx, { id: "col1", title: "To Do" });
    execute(addColumn, ctx, { id: "col2", title: "Doing" });

    const card = execute(createCard, ctx, { id: "c1", columnId: "col1", title: "Card 1" });
    expect(card?.shortId).toBe("#1");
    expect(card?.status).toBe("todo");

    execute(renameColumn, ctx, { columnId: "col1", title: "Todo" });
    expect(liveColumns(ctx.getBoardDoc())[0]?.title).toBe("Todo");

    const withStatus = execute(setCardStatus, ctx, { cardId: "c1", status: "in_progress" });
    expect(withStatus?.status).toBe("in_progress");

    const linked = execute(addLink, ctx, {
      cardId: "c1",
      id: "l1",
      url: "https://linear.app/acme/issue/ABC-1/title",
    });
    expect(linked.card?.links[0]?.provider).toBe("linear");

    const moved = execute(moveCard, ctx, { cardId: "c1", toColumnId: "col2" });
    expect(moved?.columnId).toBe("col2");

    expect(() => JSON.stringify({ card, withStatus, linked, moved })).not.toThrow();
  });

  it("rejects invalid input via zod before mutating", () => {
    const ctx = createMemoryContext();
    execute(addColumn, ctx, { id: "col1", title: "To Do" });

    const before = cardsInColumn(ctx.getBoardDoc(), "col1").length;
    expect(() => execute(createCard, ctx, { columnId: "col1", title: "" })).toThrow(ZodError);
    const after = cardsInColumn(ctx.getBoardDoc(), "col1").length;
    expect(after).toBe(before);
  });
});

describe("export / import commands", () => {
  it("exports the board and imports the snapshot into another user's doc (round-trip)", () => {
    const src = createMemoryContext({ userId: "src", clientId: "c1", now: () => 100 });
    initBoard(src.getBoardDoc(), { title: "Source", now: 100 });
    execute(addColumn, src, { id: "col1", title: "To Do" });
    execute(createCard, src, { id: "k1", columnId: "col1", title: "Task" });
    execute(setCardStatus, src, { cardId: "k1", status: "in_progress" });

    const snapshot = execute(exportBoard, src, {});
    expect(snapshot.columns).toHaveLength(1);
    expect(snapshot.cards[0]).toMatchObject({ title: "Task", status: "in_progress" });

    // Import into a fresh (different user's) empty doc.
    const dst = createMemoryContext({ userId: "dst", clientId: "c2", now: () => 100 });
    const imported = execute(importBoard, dst, { snapshot });
    expect(imported.id).toBe("dst");
    const cols = liveColumns(dst.getBoardDoc());
    expect(cols.map((c) => c.title)).toEqual(["To Do"]);
    expect(cardsInColumn(dst.getBoardDoc(), cols[0]!.id)[0]?.title).toBe("Task");
  });

  it("rejects a malformed snapshot via zod (nothing created)", () => {
    const ctx = createMemoryContext();
    expect(() => execute(importBoard, ctx, { snapshot: { board: {} } as never })).toThrow(ZodError);
  });
});

describe("parity", () => {
  function runScript(ctx: CommandContext): void {
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
    execute(addColumn, ctx, { id: "col1", title: "To Do" });
    execute(addColumn, ctx, { id: "col2", title: "Doing" });
    execute(createCard, ctx, { id: "c1", columnId: "col1", title: "Card 1" });
    execute(createCard, ctx, { id: "c2", columnId: "col1", title: "Card 2" });
    execute(moveCard, ctx, { cardId: "c1", toColumnId: "col2" });
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
      columns: liveColumns(doc),
      col1: cardsInColumn(doc, "col1"),
      col2: cardsInColumn(doc, "col2"),
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
