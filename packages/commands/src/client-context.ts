// Client CommandContext backed by the sync provider registry, so commands
// mutate the same persisted board/workspace docs the UI renders via `useY`.
// Separate entry (`@boardly/commands/client`) to keep IndexedDB/React off the
// server's import graph.
import { getBoardDoc, getWorkspaceDoc } from "@boardly/sync/client";

import type { CommandContext } from "./context";

export interface ClientContextOptions {
  userId: string;
  clientId: string;
  now?: () => number;
}

export function createClientContext(options: ClientContextOptions): CommandContext {
  return {
    getBoardDoc: (boardId) => getBoardDoc(boardId).doc,
    getWorkspaceDoc: () => getWorkspaceDoc(options.userId).doc,
    clientId: options.clientId,
    now: options.now ?? (() => Date.now()),
    userId: options.userId,
  };
}
