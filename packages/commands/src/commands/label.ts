import { DEFAULT_LABEL_COLOR } from "@boardly/domain";
import {
  addLabel,
  assignLabel as syncAssignLabel,
  deleteLabel as syncDeleteLabel,
  listLabels,
  recolorLabel as syncRecolorLabel,
  renameLabel as syncRenameLabel,
  unassignLabel as syncUnassignLabel,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const createLabel = defineCommand({
  name: "createLabel",
  description: "Create a label in the board palette.",
  input: z.object({
    name: z.string().min(1),
    color: z.string().optional(),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    const id = addLabel(doc, {
      id: input.id,
      name: input.name,
      color: input.color ?? DEFAULT_LABEL_COLOR,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return listLabels(doc).find((l) => l.id === id) ?? null;
  },
});

export const renameLabel = defineCommand({
  name: "renameLabel",
  description: "Rename a label (updates everywhere it is used).",
  input: z.object({ labelId: z.string(), name: z.string().min(1) }),
  run: (ctx, input) => {
    syncRenameLabel(ctx.getBoardDoc(), input.labelId, input.name, ctx.now());
    return { id: input.labelId };
  },
});

export const recolorLabel = defineCommand({
  name: "recolorLabel",
  description: "Change a label's color (updates everywhere it is used).",
  input: z.object({ labelId: z.string(), color: z.string().min(1) }),
  run: (ctx, input) => {
    syncRecolorLabel(ctx.getBoardDoc(), input.labelId, input.color, ctx.now());
    return { id: input.labelId };
  },
});

export const deleteLabel = defineCommand({
  name: "deleteLabel",
  description: "Delete a label from the palette and remove it from all cards.",
  input: z.object({ labelId: z.string() }),
  run: (ctx, input) => {
    syncDeleteLabel(ctx.getBoardDoc(), input.labelId, ctx.now());
    return { id: input.labelId, deleted: true };
  },
});

export const assignLabel = defineCommand({
  name: "assignLabel",
  description: "Assign a label to a card.",
  input: z.object({ cardId: z.string(), labelId: z.string() }),
  run: (ctx, input) => {
    syncAssignLabel(ctx.getBoardDoc(), input.cardId, input.labelId, ctx.now());
    return { cardId: input.cardId, labelId: input.labelId };
  },
});

export const unassignLabel = defineCommand({
  name: "unassignLabel",
  description: "Remove a label from a card.",
  input: z.object({ cardId: z.string(), labelId: z.string() }),
  run: (ctx, input) => {
    syncUnassignLabel(ctx.getBoardDoc(), input.cardId, input.labelId, ctx.now());
    return { cardId: input.cardId, labelId: input.labelId };
  },
});
