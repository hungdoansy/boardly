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
import { allLiveCards, boardProjects, listArchivedProjects, listProjects } from "@boardly/sync";
import { useY } from "@boardly/sync/react";
import { toast } from "@boardly/ui";
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

/*
 * Built as a string, not written as JSX prose: a text run that wraps onto a
 * second source line loses the space before an interpolated value ("themfrom"),
 * and Prettier deletes the `{" "}` that would fix it. The way back is spelled
 * out in words — a `>`-style breadcrumb separator would be a banned Unicode
 * glyph (DESIGN.md §7.1).
 */
const hiddenProjectMessage = (cardCount: number): string =>
  `${cardCount} ${cardCount === 1 ? "card" : "cards"} left the All view. ` +
  `Restore the project from the Hidden list in Settings, under Projects.`;

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
    // Hiding a project also takes its cards out of the "All" view (Unit 20), so
    // both entry points — the sidebar context menu and the Settings row — report
    // the size of what just disappeared and where to undo it; the project is
    // gone from the sidebar and the switcher too, so an unannounced hide leaves
    // no visible way back. The count is read from the doc *before* the mutation
    // and non-reactively: sizing a toast must not make either entry point
    // subscribe to every card on the board. Silent when nothing left the view.
    archive: useCallback(
      (projectId: string) => {
        const leaving = allLiveCards(ctx.getBoardDoc()).filter(
          (c) => c.projectId === projectId,
        ).length;
        execute(archiveProject, ctx, { projectId });
        if (leaving > 0) toast(hiddenProjectMessage(leaving));
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
