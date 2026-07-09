"use client";

import type { WorkspaceBoardRef } from "@boardly/domain";
import { addColumn, archiveBoard, createBoard, execute, renameBoard } from "@boardly/commands";
import { listBoards, workspaceBoards } from "@boardly/sync";
import { useY } from "@boardly/sync/react";
import { useCallback, useEffect, useState } from "react";

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
 * The currently-open board id, resolved client-side from the URL hash
 * (`#board/<id>`). Static-export friendly (no server route per board).
 */
export function useSelectedBoard(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = (): void => {
      const match = /^#board\/(.+)$/.exec(window.location.hash);
      setId(match?.[1] ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const select = useCallback((next: string | null) => {
    window.location.hash = next ? `board/${next}` : "";
  }, []);
  return [id, select];
}
