import {
  addColumn as syncAddColumn,
  archiveColumn as syncArchiveColumn,
  moveColumn as syncMoveColumn,
  renameColumn as syncRenameColumn,
  setColumnWipLimit as syncSetWipLimit,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const setColumnWipLimit = defineCommand({
  name: "setColumnWipLimit",
  description: "Set or clear (null) a column's soft WIP limit.",
  input: z.object({
    boardId: z.string(),
    columnId: z.string(),
    wipLimit: z.number().int().positive().nullable(),
  }),
  run: (ctx, input) => {
    syncSetWipLimit(ctx.getBoardDoc(input.boardId), input.columnId, input.wipLimit, ctx.now());
    return { id: input.columnId, wipLimit: input.wipLimit };
  },
});

export const addColumn = defineCommand({
  name: "addColumn",
  description: "Add a column to a board.",
  input: z.object({ boardId: z.string(), id: z.string().optional(), title: z.string().min(1) }),
  run: (ctx, input) => {
    const id = syncAddColumn(ctx.getBoardDoc(input.boardId), {
      id: input.id,
      title: input.title,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return { id };
  },
});

export const renameColumn = defineCommand({
  name: "renameColumn",
  description: "Rename a column.",
  input: z.object({ boardId: z.string(), columnId: z.string(), title: z.string().min(1) }),
  run: (ctx, input) => {
    syncRenameColumn(ctx.getBoardDoc(input.boardId), input.columnId, input.title, ctx.now());
    return { id: input.columnId };
  },
});

export const moveColumn = defineCommand({
  name: "moveColumn",
  description: "Reorder a column between two neighbors.",
  input: z.object({
    boardId: z.string(),
    columnId: z.string(),
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    syncMoveColumn(
      ctx.getBoardDoc(input.boardId),
      input.columnId,
      { afterId: input.afterId ?? null, beforeId: input.beforeId ?? null },
      ctx.clientId,
      ctx.now(),
    );
    return { id: input.columnId };
  },
});

export const archiveColumn = defineCommand({
  name: "archiveColumn",
  description: "Archive a column (its cards become reclaimable).",
  input: z.object({ boardId: z.string(), columnId: z.string() }),
  run: (ctx, input) => {
    syncArchiveColumn(ctx.getBoardDoc(input.boardId), input.columnId, ctx.now());
    return { id: input.columnId };
  },
});
