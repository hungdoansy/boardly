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
import { buildBoardHash, currentHashBody, parseRoute, subscribeRoute, writeHashBody } from "./route";

// The selected project scope (null = "All") lives in the URL hash so All and
// each project are real, linkable nav destinations (see route.ts). The hash is
// authoritative; `setSelectedProject` navigates to a fresh project board (no
// open card, exits Settings), and reads derive the scope from the current hash.

/** Read the current scope without subscribing (for command handlers). */
export function getSelectedProject(): string | null {
  return parseRoute(currentHashBody()).projectId;
}

export function setSelectedProject(id: string | null): void {
  writeHashBody(buildBoardHash(id));
}

/** The selected project scope + setter (null = All), tracked via the URL hash. */
export function useSelectedProject(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribeRoute, getSelectedProject, () => null);
  return [id, setSelectedProject];
}

/** Live, ord-sorted, non-archived projects for the board. */
export function useProjects(): Project[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardProjects(doc), () => listProjects(doc), { deep: true });
}

export interface ProjectActions {
  create(name?: string): string | null;
  rename(projectId: string, name: string): void;
  recolor(projectId: string, color: string): void;
  archive(projectId: string): void;
}

export function useProjectActions(): ProjectActions {
  const ctx = useBoardlyContext();
  return {
    create: useCallback(
      (name = "New project") => execute(createProject, ctx, { name })?.id ?? null,
      [ctx],
    ),
    rename: useCallback(
      (projectId: string, name: string) => {
        execute(renameProject, ctx, { projectId, name });
      },
      [ctx],
    ),
    recolor: useCallback(
      (projectId: string, color: string) => {
        execute(recolorProject, ctx, { projectId, color });
      },
      [ctx],
    ),
    archive: useCallback(
      (projectId: string) => {
        execute(archiveProject, ctx, { projectId });
      },
      [ctx],
    ),
  };
}
