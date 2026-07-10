// Board import/export commands (Unit 4.4). `exportBoard` returns a full-fidelity
// snapshot; `importBoard` creates a new board from one (validated by the shared
// domain schema, so REST/MCP callers validate identically to the UI).
import { boardSnapshotSchema, newId } from "@boardly/domain";
import { addBoardRef, boardToSnapshot, buildBoardFromSnapshot, getBoard } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const exportBoard = defineCommand({
  name: "exportBoard",
  description:
    "Export a board as a full-fidelity snapshot (columns, cards, fields, labels, order).",
  input: z.object({ boardId: z.string() }),
  run: (ctx, input) => boardToSnapshot(ctx.getBoardDoc(input.boardId), input.boardId),
});

export const importBoard = defineCommand({
  name: "importBoard",
  description: "Create a new board from a snapshot (from JSON or Obsidian-Kanban import).",
  input: z.object({
    snapshot: boardSnapshotSchema,
    /** Optional board id (else generated) and title override. */
    id: z.string().optional(),
    title: z.string().min(1).optional(),
  }),
  run: (ctx, input) => {
    const boardId = input.id ?? newId();
    const title = input.title ?? input.snapshot.board.title;
    addBoardRef(ctx.getWorkspaceDoc(), {
      id: boardId,
      title,
      icon: input.snapshot.board.icon,
      clientId: ctx.clientId,
    });
    const doc = ctx.getBoardDoc(boardId);
    buildBoardFromSnapshot(
      doc,
      { ...input.snapshot, board: { ...input.snapshot.board, title } },
      ctx.now(),
    );
    return getBoard(doc, boardId);
  },
});
