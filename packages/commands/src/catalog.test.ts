import { cardsInColumn, getBoard, liveColumns } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { catalog, commands, getCommand, listCommandNames } from "./catalog";
import { execute } from "./command";
import { addLink } from "./commands/link";
import { archiveCard, createCard, moveCard } from "./commands/card";
import { addColumn, renameColumn } from "./commands/column";
import { createBoard } from "./commands/board";
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
});

describe("commands (client context)", () => {
  it("runs core mutations and returns JSON-serializable results", () => {
    const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });

    const board = execute(createBoard, ctx, { id: "b1", title: "Board" });
    expect(board.title).toBe("Board");

    execute(addColumn, ctx, { boardId: "b1", id: "col1", title: "To Do" });
    execute(addColumn, ctx, { boardId: "b1", id: "col2", title: "Doing" });

    const card = execute(createCard, ctx, {
      boardId: "b1",
      id: "c1",
      columnId: "col1",
      title: "Card 1",
    });
    expect(card?.shortId).toBe("#1");
    expect(card?.status).toBe("todo");

    execute(renameColumn, ctx, { boardId: "b1", columnId: "col1", title: "Todo" });
    expect(liveColumns(ctx.getBoardDoc("b1"))[0]?.title).toBe("Todo");

    const withStatus = execute(setCardStatus, ctx, {
      boardId: "b1",
      cardId: "c1",
      status: "in_progress",
    });
    expect(withStatus?.status).toBe("in_progress");

    const linked = execute(addLink, ctx, {
      boardId: "b1",
      cardId: "c1",
      id: "l1",
      url: "https://linear.app/acme/issue/ABC-1/title",
    });
    expect(linked.card?.links[0]?.provider).toBe("linear");

    const moved = execute(moveCard, ctx, { boardId: "b1", cardId: "c1", toColumnId: "col2" });
    expect(moved?.columnId).toBe("col2");

    expect(() => JSON.stringify({ board, card, withStatus, linked, moved })).not.toThrow();
  });

  it("rejects invalid input via zod before mutating", () => {
    const ctx = createMemoryContext();
    execute(createBoard, ctx, { id: "b1", title: "Board" });
    execute(addColumn, ctx, { boardId: "b1", id: "col1", title: "To Do" });

    const before = cardsInColumn(ctx.getBoardDoc("b1"), "col1").length;
    expect(() => execute(createCard, ctx, { boardId: "b1", columnId: "col1", title: "" })).toThrow(
      ZodError,
    );
    const after = cardsInColumn(ctx.getBoardDoc("b1"), "col1").length;
    expect(after).toBe(before);
  });
});

describe("export / import commands", () => {
  it("exports a board and imports the snapshot into a new board (round-trip)", () => {
    const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
    execute(createBoard, ctx, { id: "b1", title: "Source" });
    execute(addColumn, ctx, { boardId: "b1", id: "col1", title: "To Do" });
    execute(createCard, ctx, { boardId: "b1", id: "k1", columnId: "col1", title: "Task" });
    execute(setCardStatus, ctx, { boardId: "b1", cardId: "k1", status: "in_progress" });

    const snapshot = execute(exportBoard, ctx, { boardId: "b1" });
    expect(snapshot.columns).toHaveLength(1);
    expect(snapshot.cards[0]).toMatchObject({ title: "Task", status: "in_progress" });

    const imported = execute(importBoard, ctx, { snapshot, id: "b2" });
    expect(imported.id).toBe("b2");
    const cols = liveColumns(ctx.getBoardDoc("b2"));
    expect(cols.map((c) => c.title)).toEqual(["To Do"]);
    expect(cardsInColumn(ctx.getBoardDoc("b2"), cols[0]!.id)[0]?.title).toBe("Task");
  });

  it("rejects a malformed snapshot via zod (nothing created)", () => {
    const ctx = createMemoryContext();
    expect(() => execute(importBoard, ctx, { snapshot: { board: {} } as never })).toThrow(ZodError);
  });
});

describe("parity", () => {
  function runScript(ctx: CommandContext): void {
    execute(createBoard, ctx, { id: "b1", title: "Board" });
    execute(addColumn, ctx, { boardId: "b1", id: "col1", title: "To Do" });
    execute(addColumn, ctx, { boardId: "b1", id: "col2", title: "Doing" });
    execute(createCard, ctx, { boardId: "b1", id: "c1", columnId: "col1", title: "Card 1" });
    execute(createCard, ctx, { boardId: "b1", id: "c2", columnId: "col1", title: "Card 2" });
    execute(moveCard, ctx, { boardId: "b1", cardId: "c1", toColumnId: "col2" });
    execute(setCardStatus, ctx, { boardId: "b1", cardId: "c2", status: "done" });
    execute(addLink, ctx, {
      boardId: "b1",
      cardId: "c2",
      id: "l1",
      url: "https://linear.app/acme/issue/ABC-9/x",
    });
    execute(archiveCard, ctx, { boardId: "b1", cardId: "c1" });
  }

  function snapshot(ctx: CommandContext) {
    const doc = ctx.getBoardDoc("b1");
    return {
      board: getBoard(doc, "b1"),
      columns: liveColumns(doc),
      col1: cardsInColumn(doc, "col1"),
      col2: cardsInColumn(doc, "col2"),
    };
  }

  it("a client context and a server-style context produce identical state", () => {
    // Both are in-memory here; the real server uses a Hocuspocus direct
    // connection (Unit 3.9). Same inputs + injected clientId/now → same state.
    const client = createMemoryContext({ clientId: "same", now: () => 100 });
    const server = createMemoryContext({ clientId: "same", now: () => 100 });
    runScript(client);
    runScript(server);
    expect(snapshot(client)).toEqual(snapshot(server));
  });
});
