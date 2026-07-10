"use client";

import {
  attachNetwork,
  boardDocName,
  getBoardDoc,
  getWorkspaceDoc,
  workspaceDocName,
  type NetworkHandle,
} from "@boardly/sync/client";
import { useEffect, useRef } from "react";

import { apiClient, SYNC_WS_URL } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";
import { LOCAL_USER } from "../../lib/boardly-context";
import { useBoards, useSelectedBoard } from "../../lib/use-boards";

/**
 * Bridges local Yjs docs to the sync server once authenticated:
 *  - the workspace doc (board list) — always, so boards sync across devices;
 *  - the currently-open board's content doc — after its ownership is registered
 *    (Unit 3.8), so board content syncs too;
 *  - reconciliation: registers every local board on login, so offline-created
 *    boards get their server ownership row on the next connection.
 * Attaches only after local hydrate (`attachNetwork` → `whenSynced`).
 */
export function SyncBridge() {
  const { status, userId } = useAuthSession();
  const boards = useBoards();
  const [selectedBoardId] = useSelectedBoard();

  // Keep the latest board list without making it a dependency of the per-board
  // sync effect (title lookups shouldn't re-attach the socket).
  const boardsRef = useRef(boards);
  boardsRef.current = boards;

  // 1. Workspace (board list) doc.
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let net: NetworkHandle | undefined;
    let disposed = false;
    void attachNetwork(getWorkspaceDoc(LOCAL_USER), {
      documentName: workspaceDocName(userId),
      url: SYNC_WS_URL,
      getTicket: (documentName) => apiClient.getSyncTicket(documentName),
    }).then((handle) => {
      if (disposed) handle.destroy();
      else net = handle;
    });
    return () => {
      disposed = true;
      net?.destroy();
    };
  }, [status, userId]);

  // 2. Reconcile ownership: register every local board (idempotent server-side).
  useEffect(() => {
    if (status !== "authenticated") return;
    for (const board of boards) void apiClient.registerBoard(board.id, board.title);
  }, [status, boards]);

  // 3. The open board's content doc — register first (so the ticket authorizes),
  // then attach.
  useEffect(() => {
    if (status !== "authenticated" || !selectedBoardId) return;
    let net: NetworkHandle | undefined;
    let disposed = false;
    void (async () => {
      const board = boardsRef.current.find((b) => b.id === selectedBoardId);
      if (board) await apiClient.registerBoard(board.id, board.title).catch(() => {});
      const handle = await attachNetwork(getBoardDoc(selectedBoardId), {
        documentName: boardDocName(selectedBoardId),
        url: SYNC_WS_URL,
        getTicket: (documentName) => apiClient.getSyncTicket(documentName),
      });
      if (disposed) handle.destroy();
      else net = handle;
    })();
    return () => {
      disposed = true;
      net?.destroy();
    };
  }, [status, selectedBoardId]);

  return null;
}
