"use client";

import type { WorkspaceBoardRef } from "@boardly/domain";
import { addColumn, archiveBoard, createBoard, execute, renameBoard } from "@boardly/commands";
import { listBoards, liveColumns, workspaceBoards } from "@boardly/sync";
import { getWorkspaceDoc } from "@boardly/sync/client";
import { useY } from "@boardly/sync/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "./api-client";
import { LOCAL_USER, useBoardlyContext } from "./boardly-context";

/** Columns every new board starts with. */
const DEFAULT_COLUMNS = ["To Do", "Doing", "Done"];

/** The single auto-provisioned board (Boardly is single-board — Unit 2). The id is
 * deterministic so two devices provisioning independently converge on one board
 * (the workspace index keys by id) rather than creating phantom duplicates. */
export const MAIN_BOARD_ID = "main";
export const MAIN_BOARD_TITLE = "Main board";

/** Live list of the user's (non-archived) boards, sorted by ord. */
export function useBoards(): WorkspaceBoardRef[] {
  const ctx = useBoardlyContext();
  const doc = ctx.getWorkspaceDoc();
  return useY(workspaceBoards(doc), () => listBoards(doc), { deep: true });
}

export interface BoardActions {
  create(title?: string, id?: string): string;
  rename(boardId: string, title: string): void;
  archive(boardId: string): void;
}

export function useBoardActions(): BoardActions {
  const ctx = useBoardlyContext();
  const create = useCallback(
    (title = "New board", id?: string) => {
      const board = execute(createBoard, ctx, id ? { title, id } : { title });
      // Seed default columns only if this board has none yet — idempotent across
      // reloads and across a well-known board provisioned on two devices.
      if (liveColumns(ctx.getBoardDoc(board.id)).length === 0) {
        for (const columnTitle of DEFAULT_COLUMNS) {
          execute(addColumn, ctx, { boardId: board.id, title: columnTitle });
        }
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

/**
 * Boardly is single-board: ensure exactly one board exists and stays selected.
 * On first run (empty workspace) this creates the one "Main board" (with default
 * columns + server registration) and opens it; afterwards it just keeps a valid
 * board selected. Idempotent — a `creating` ref guards against a double-create
 * before the workspace doc update propagates (React strict-mode / re-renders).
 */
export function useEnsureBoard(): void {
  const boards = useBoards();
  const [selected, select] = useSelectedBoard();
  const { create } = useBoardActions();
  const creating = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // Wait for the workspace doc to hydrate from IndexedDB before deciding the
  // workspace is empty — otherwise the first render sees no boards and would
  // provision a phantom board that then collides with the persisted one.
  useEffect(() => {
    let mounted = true;
    void getWorkspaceDoc(LOCAL_USER).whenSynced.then(() => {
      if (mounted) setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (boards.length === 0) {
      if (creating.current) return;
      creating.current = true;
      select(create(MAIN_BOARD_TITLE, MAIN_BOARD_ID));
      return;
    }
    if (!selected || !boards.some((b) => b.id === selected)) {
      select(boards[0]!.id);
    }
  }, [hydrated, boards, selected, create, select]);
}
