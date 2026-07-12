// Board import/export commands. `exportBoard` returns a full-fidelity snapshot
// of the caller's single per-user doc; `importBoard` populates that same doc
// from one (validated by the shared domain schema, so REST/MCP callers validate
// identically to the UI).
import { boardSnapshotSchema } from "@boardly/domain";
import { boardToSnapshot, buildBoardFromSnapshot, getBoard } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// The board id is the caller's user id (one doc per user).
const boardId = (ctx: { userId?: string; clientId: string }): string => ctx.userId ?? ctx.clientId;

export const exportBoard = defineCommand({
  name: "exportBoard",
  description:
    "Export the board as a full-fidelity snapshot (columns, cards, fields, labels, order).",
  input: z.object({}),
  run: (ctx) => boardToSnapshot(ctx.getBoardDoc(), boardId(ctx)),
});

export const importBoard = defineCommand({
  name: "importBoard",
  description: "Populate the board from a snapshot (from JSON or Obsidian-Kanban import).",
  input: z.object({
    snapshot: boardSnapshotSchema,
    /** Optional title override. */
    title: z.string().min(1).optional(),
  }),
  run: (ctx, input) => {
    const title = input.title ?? input.snapshot.board.title;
    const doc = ctx.getBoardDoc();
    buildBoardFromSnapshot(
      doc,
      { ...input.snapshot, board: { ...input.snapshot.board, title } },
      ctx.now(),
    );
    return getBoard(doc, boardId(ctx));
  },
});
