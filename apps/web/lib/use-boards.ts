"use client";

import type { WorkspaceBoardRef } from "@boardly/domain";
import { addColumn, archiveBoard, createBoard, execute, renameBoard } from "@boardly/commands";
import { listBoards, workspaceBoards } from "@boardly/sync";
import { useY } from "@boardly/sync/react";
import { useCallback, useEffect, useState } from "react";

import { apiClient } from "./api-client";
import { useBoardlyContext } from "./boardly-context";

/** Columns every new board starts with. */
const DEFAULT_COLUMNS = ["To Do", "Doing", "Done"];

/** Live list of the user's (non-archived) boards, sorted by ord. */
export function useBoards(): WorkspaceBoardRef[] {
  const ctx = useBoardlyContext();
  const doc = ctx.getWorkspaceDoc();
  return useY(workspaceBoards(doc), () => listBoards(doc), { deep: true });
}

export interface BoardActions {
  create(title?: string): string;
  rename(boardId: string, title: string): void;
  archive(boardId: string): void;
}

export function useBoardActions(): BoardActions {
  const ctx = useBoardlyContext();
  const create = useCallback(
    (title = "New board") => {
      const board = execute(createBoard, ctx, { title });
      for (const columnTitle of DEFAULT_COLUMNS) {
        execute(addColumn, ctx, { boardId: board.id, title: columnTitle });
      }
      // Register ownership server-side so the board's sync room authorizes
      // (Unit 3.8). Fire-and-forget; offline creates reconcile later (SyncBridge).
      void apiClient.registerBoard(board.id, title);
      return board.id;
    },
    [ctx],
  );
  const rename = useCallback(
    (boardId: string, title: string) => {
      execute(renameBoard, ctx, { boardId, title });
    },
    [ctx],
  );
  const archive = useCallback(
    (boardId: string) => {
      execute(archiveBoard, ctx, { boardId });
    },
    [ctx],
  );
  return { create, rename, archive };
}

/**
 * The URL hash routes the workspace, static-export friendly (no server route
 * per board): `#board/<boardId>` or, with a card open, `#board/<boardId>/card/<cardId>`.
 */
const HASH_RE = /^#board\/([^/]+)(?:\/card\/([^/]+))?$/;

interface HashRoute {
  boardId: string | null;
  cardId: string | null;
}

function readHash(): HashRoute {
  const match = HASH_RE.exec(window.location.hash);
  return { boardId: match?.[1] ?? null, cardId: match?.[2] ?? null };
}

function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>({ boardId: null, cardId: null });
  useEffect(() => {
    const read = (): void => setRoute(readHash());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return route;
}

function writeHash(boardId: string | null, cardId: string | null): void {
  if (!boardId) {
    window.location.hash = "";
    return;
  }
  window.location.hash = cardId ? `board/${boardId}/card/${cardId}` : `board/${boardId}`;
}

/** The currently-open board id (opening a board clears any open card). */
export function useSelectedBoard(): [string | null, (id: string | null) => void] {
  const { boardId } = useHashRoute();
  const select = useCallback((next: string | null) => writeHash(next, null), []);
  return [boardId, select];
}

/**
 * The open card id for the current board, and a setter that preserves the board
 * segment. Used by the board view (detail sheet) and by search/palette to deep
 * link to a card.
 */
export function useSelectedCard(): [string | null, (cardId: string | null) => void] {
  const { boardId, cardId } = useHashRoute();
  const setCard = useCallback((next: string | null) => writeHash(boardId, next), [boardId]);
  return [cardId, setCard];
}

/** Open a specific card on a specific board in one hash write (cross-board safe). */
export function useOpenCardNav(): (boardId: string, cardId: string) => void {
  return useCallback((boardId: string, cardId: string) => writeHash(boardId, cardId), []);
}
