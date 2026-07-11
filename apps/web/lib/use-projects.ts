"use client";

import type { Project } from "@boardly/domain";
import {
  archiveProject,
  createProject,
  execute,
  recolorProject,
  renameProject,
} from "@boardly/commands";
import { boardProjects, listProjects } from "@boardly/sync";
import { useY } from "@boardly/sync/react";
import { useCallback, useSyncExternalStore } from "react";

import { useBoardlyContext } from "./boardly-context";

// The selected project scope (null = "All"). It's view state, not a deep link,
// so it lives in a tiny module store rather than the URL — one board, one user.
let selectedProjectId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Read the current scope without subscribing (for command handlers). */
export function getSelectedProject(): string | null {
  return selectedProjectId;
}

export function setSelectedProject(id: string | null): void {
  if (selectedProjectId === id) return;
  selectedProjectId = id;
  emit();
}

/** The selected project scope + setter (null = All). */
export function useSelectedProject(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selectedProjectId,
    () => null,
  );
  return [id, setSelectedProject];
}

/** Live, ord-sorted, non-archived projects for the board. */
export function useProjects(boardId: string): Project[] {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useY(boardProjects(doc), () => listProjects(doc), { deep: true });
}

export interface ProjectActions {
  create(name?: string): string | null;
  rename(projectId: string, name: string): void;
  recolor(projectId: string, color: string): void;
  archive(projectId: string): void;
}

export function useProjectActions(boardId: string): ProjectActions {
  const ctx = useBoardlyContext();
  return {
    create: useCallback(
      (name = "New project") => execute(createProject, ctx, { boardId, name })?.id ?? null,
      [ctx, boardId],
    ),
    rename: useCallback(
      (projectId: string, name: string) => {
        execute(renameProject, ctx, { boardId, projectId, name });
      },
      [ctx, boardId],
    ),
    recolor: useCallback(
      (projectId: string, color: string) => {
        execute(recolorProject, ctx, { boardId, projectId, color });
      },
      [ctx, boardId],
    ),
    archive: useCallback(
      (projectId: string) => {
        execute(archiveProject, ctx, { boardId, projectId });
      },
      [ctx, boardId],
    ),
  };
}
