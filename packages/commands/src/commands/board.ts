import { normalizeTicketPrefix } from "@boardly/domain";
import {
  getBoard,
  renameBoard as syncRenameBoard,
  setBadgeConfig as syncSetBadgeConfig,
  setShowEmptyColumns as syncSetShowEmptyColumns,
  setTicketPrefix as syncSetTicketPrefix,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// The board id is the caller's user id (one doc per user); these commands read
// it back off the context so callers never pass a board id.
const boardId = (ctx: { userId?: string; clientId: string }): string => ctx.userId ?? ctx.clientId;

export const renameBoard = defineCommand({
  name: "renameBoard",
  description: "Rename the space (board).",
  input: z.object({ title: z.string().min(1) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncRenameBoard(doc, input.title, ctx.now());
    return getBoard(doc, boardId(ctx));
  },
});

export const setBadgeConfig = defineCommand({
  name: "setBadgeConfig",
  description: "Set the ordered card-face badge row for the board.",
  input: z.object({ config: z.array(z.string()) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetBadgeConfig(doc, input.config, ctx.now());
    return getBoard(doc, boardId(ctx));
  },
});

export const setTicketPrefix = defineCommand({
  name: "setTicketPrefix",
  description:
    "Set the board's ticket prefix (uppercase, max 5 chars; empty shows ids as #123). Display-only.",
  input: z.object({ prefix: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetTicketPrefix(doc, normalizeTicketPrefix(input.prefix), ctx.now());
    return getBoard(doc, boardId(ctx));
  },
});

export const setShowEmptyColumns = defineCommand({
  name: "setShowEmptyColumns",
  description: "Toggle whether empty status columns are shown on the board.",
  input: z.object({ show: z.boolean() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetShowEmptyColumns(doc, input.show, ctx.now());
    return getBoard(doc, boardId(ctx));
  },
});
