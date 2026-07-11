"use client";

import type { WorkspaceBoardRef } from "@boardly/domain";
import { formatTicketRef, parseTicketRef } from "@boardly/domain";
import type { CommandContext } from "@boardly/commands";
import { addColumn, archiveBoard, createBoard, execute, renameBoard } from "@boardly/commands";
import { getBoard, getCard, listBoards, liveColumns, workspaceBoards } from "@boardly/sync";
import { getWorkspaceDoc } from "@boardly/sync/client";
import { useY } from "@boardly/sync/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "./api-client";
import { LOCAL_USER, useBoardlyContext } from "./boardly-context";
import { useAllCards } from "./use-board";

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

// Single-board routing (static-export friendly): the URL hash names only the
// open ticket, Linear-style — `#TEC-42-fix-login` or, with an empty prefix,
// `#42-fix-login`. The board is implicit (there is exactly one). The hash
// resolves by its integer; the prefix and slug are cosmetic (a stale prefix or
// edited title still opens the right card). An empty hash means no card open.

/** The ticket number named by the URL hash, reactive to hashchange. */
function useHashTicketNumber(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      const ref = window.location.hash.replace(/^#/, "");
      setN(ref ? parseTicketRef(ref) : null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return n;
}

/** Write (or clear) the Linear-style ticket hash for a card on the given board. */
function writeCardHash(
  getBoardDoc: CommandContext["getBoardDoc"],
  boardId: string,
  cardId: string,
): void {
  const doc = getBoardDoc(boardId);
  const card = getCard(doc, cardId);
  if (!card) {
    window.location.hash = "";
    return;
  }
  window.location.hash = formatTicketRef(
    getBoard(doc, boardId).shortIdPrefix,
    card.number,
    card.title,
  );
}

/**
 * The single board's id (Boardly is single-board). Derived from the boards list,
 * not the URL. `select` is retained for API compatibility but is a no-op — there
 * is nothing to switch between.
 */
export function useSelectedBoard(): [string | null, (id: string | null) => void] {
  const boards = useBoards();
  const boardId = boards[0]?.id ?? null;
  const select = useCallback(() => {}, []);
  return [boardId, select];
}

/**
 * The open card id (uuid) for the single board plus a setter, bridged to the
 * Linear-style ticket hash. Reads resolve the hash's integer to a card id over
 * the live card list; the setter serializes a card id back to `PREFIX-N-slug`.
 */
export function useSelectedCard(): [string | null, (cardId: string | null) => void] {
  const ctx = useBoardlyContext();
  const [boardId] = useSelectedBoard();
  const number = useHashTicketNumber();
  const cards = useAllCards(boardId ?? "");
  const cardId = number != null ? (cards.find((c) => c.number === number)?.id ?? null) : null;

  const setCard = useCallback(
    (next: string | null) => {
      if (!next || !boardId) {
        window.location.hash = "";
        return;
      }
      writeCardHash(ctx.getBoardDoc, boardId, next);
    },
    [ctx, boardId],
  );
  return [cardId, setCard];
}

/** Open a specific card (used by search/palette). Board is the single board. */
export function useOpenCardNav(): (boardId: string, cardId: string) => void {
  const ctx = useBoardlyContext();
  return useCallback(
    (boardId: string, cardId: string) => writeCardHash(ctx.getBoardDoc, boardId, cardId),
    [ctx],
  );
}

/**
 * Boardly is single-board: ensure exactly one board exists. On first run (empty
 * workspace, after IndexedDB hydration) this creates the one "Main board" with
 * default columns + server registration. Selection is automatic — `useSelectedBoard`
 * derives the board from the list. A `creating` ref guards against a double-create
 * before the workspace doc update propagates (React strict-mode / re-renders).
 */
export function useEnsureBoard(): void {
  const boards = useBoards();
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
    if (!hydrated || creating.current) return;
    if (boards.length === 0) {
      creating.current = true;
      create(MAIN_BOARD_TITLE, MAIN_BOARD_ID);
    }
  }, [hydrated, boards, create]);
}
