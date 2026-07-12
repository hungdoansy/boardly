import { DEFAULT_LABEL_COLOR } from "@boardly/domain";
import {
  addProject,
  archiveProject as syncArchiveProject,
  listProjects,
  recolorProject as syncRecolorProject,
  renameProject as syncRenameProject,
  setCardProject as syncSetCardProject,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const createProject = defineCommand({
  name: "createProject",
  description: "Create a project (a grouping under the board).",
  input: z.object({
    name: z.string().min(1),
    color: z.string().optional(),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    const id = addProject(doc, {
      id: input.id,
      name: input.name,
      color: input.color ?? DEFAULT_LABEL_COLOR,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return listProjects(doc).find((p) => p.id === id) ?? null;
  },
});

export const renameProject = defineCommand({
  name: "renameProject",
  description: "Rename a project.",
  input: z.object({ projectId: z.string(), name: z.string().min(1) }),
  run: (ctx, input) => {
    syncRenameProject(ctx.getBoardDoc(), input.projectId, input.name, ctx.now());
    return { id: input.projectId };
  },
});

export const recolorProject = defineCommand({
  name: "recolorProject",
  description: "Change a project's color.",
  input: z.object({ projectId: z.string(), color: z.string().min(1) }),
  run: (ctx, input) => {
    syncRecolorProject(ctx.getBoardDoc(), input.projectId, input.color, ctx.now());
    return { id: input.projectId };
  },
});

export const archiveProject = defineCommand({
  name: "archiveProject",
  description: "Archive a project (hidden from the list; cards keep their projectId).",
  input: z.object({ projectId: z.string() }),
  run: (ctx, input) => {
    syncArchiveProject(ctx.getBoardDoc(), input.projectId, ctx.now());
    return { id: input.projectId, archived: true };
  },
});

export const listProjectsCommand = defineCommand({
  name: "listProjects",
  description: "List the board's (non-archived) projects.",
  input: z.object({}),
  run: (ctx) => listProjects(ctx.getBoardDoc()),
});

export const setCardProject = defineCommand({
  name: "setCardProject",
  description: "Assign a card to a project, or clear it with null.",
  input: z.object({
    cardId: z.string(),
    projectId: z.string().nullable(),
  }),
  run: (ctx, input) => {
    syncSetCardProject(ctx.getBoardDoc(), input.cardId, input.projectId, ctx.now());
    return { cardId: input.cardId, projectId: input.projectId };
  },
});
