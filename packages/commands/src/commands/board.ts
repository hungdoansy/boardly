import { newId, normalizeTicketPrefix } from "@boardly/domain";
import {
  addBoardRef,
  archiveBoardRef,
  getBoard,
  initBoard,
  listBoards as syncListBoards,
  renameBoard as syncRenameBoard,
  renameBoardRef,
  setBadgeConfig as syncSetBadgeConfig,
  setTicketPrefix as syncSetTicketPrefix,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const createBoard = defineCommand({
  name: "createBoard",
  description: "Create a board and register it in the workspace index.",
  input: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    icon: z.string().optional(),
  }),
  run: (ctx, input) => {
    const boardId = input.id ?? newId();
    addBoardRef(ctx.getWorkspaceDoc(), {
      id: boardId,
      title: input.title,
      icon: input.icon,
      clientId: ctx.clientId,
    });
    const doc = ctx.getBoardDoc(boardId);
    initBoard(doc, { title: input.title, icon: input.icon, now: ctx.now() });
    return getBoard(doc, boardId);
  },
});

export const renameBoard = defineCommand({
  name: "renameBoard",
  description: "Rename a board.",
  input: z.object({ boardId: z.string(), title: z.string().min(1) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncRenameBoard(doc, input.title, ctx.now());
    renameBoardRef(ctx.getWorkspaceDoc(), input.boardId, input.title);
    return getBoard(doc, input.boardId);
  },
});

export const archiveBoard = defineCommand({
  name: "archiveBoard",
  description: "Archive a board (hidden from the workspace list).",
  input: z.object({ boardId: z.string() }),
  run: (ctx, input) => {
    archiveBoardRef(ctx.getWorkspaceDoc(), input.boardId);
    return { id: input.boardId, archived: true };
  },
});

export const setBadgeConfig = defineCommand({
  name: "setBadgeConfig",
  description: "Set the ordered card-face badge row for a board.",
  input: z.object({ boardId: z.string(), config: z.array(z.string()) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetBadgeConfig(doc, input.config, ctx.now());
    return getBoard(doc, input.boardId);
  },
});

export const setTicketPrefix = defineCommand({
  name: "setTicketPrefix",
  description:
    "Set the board's ticket prefix (uppercase, max 5 chars; empty shows ids as #123). Display-only.",
  input: z.object({ boardId: z.string(), prefix: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetTicketPrefix(doc, normalizeTicketPrefix(input.prefix), ctx.now());
    return getBoard(doc, input.boardId);
  },
});

export const listBoards = defineCommand({
  name: "listBoards",
  description: "List the user's boards.",
  input: z.object({}),
  run: (ctx) => syncListBoards(ctx.getWorkspaceDoc()),
});
