"use client";

import type { Project } from "@boardly/domain";
import {
  archiveProject,
  createProject,
  execute,
  recolorProject,
  renameProject,
  showProject,
} from "@boardly/commands";
import { boardProjects, listArchivedProjects, listProjects } from "@boardly/sync";
import { useY } from "@boardly/sync/react";
import { useCallback, useSyncExternalStore } from "react";

import { useBoardlyContext } from "./boardly-context";
import {
  buildBoardHash,
  currentHashBody,
  parseRoute,
  subscribeRoute,
  writeHashBody,
} from "./route";

// The selected project scope (null = "All") lives in the URL hash so All and
// each project are real, linkable nav destinations (see route.ts). The hash is
// authoritative; `setSelectedProject` navigates to a fresh project board (no
// open card, exits Settings), and reads derive the scope from the current hash.

/** Read the current scope without subscribing (for command handlers). */
export function getSelectedProject(): string | null {
  return parseRoute(currentHashBody()).projectId;
}

// `ref` is a project URL ref (`<id>-<slug>` from `formatProjectRef`, or a bare
// id), or null for "All". Reads resolve the scope back to the project id.
export function setSelectedProject(ref: string | null): void {
  writeHashBody(buildBoardHash(ref));
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

/** Live, ord-sorted, hidden (archived) projects — for the Settings restore list. */
export function useArchivedProjects(): Project[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardProjects(doc), () => listArchivedProjects(doc), { deep: true });
}

export interface ProjectActions {
  /** Create a project, returning it (so callers can build its URL ref) or null. */
  create(name?: string): Project | null;
  rename(projectId: string, name: string): void;
  recolor(projectId: string, color: string): void;
  /** Hide a project from the board (reversible with {@link ProjectActions.show}). */
  archive(projectId: string): void;
  /** Restore a hidden project to the board. */
  show(projectId: string): void;
}

export function useProjectActions(): ProjectActions {
  const ctx = useBoardlyContext();
  return {
    create: useCallback(
      (name = "New project") => execute(createProject, ctx, { name }) ?? null,
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
    show: useCallback(
      (projectId: string) => {
        execute(showProject, ctx, { projectId });
      },
      [ctx],
    ),
  };
}
