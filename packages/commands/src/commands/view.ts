import type { Filter, SavedView } from "@boardly/domain";
import { deleteView as syncDeleteView, listViews, saveView as syncSaveView } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

const clauseSchema = z.object({
  field: z.enum(["status", "priority", "label", "dueDate", "assignee", "title"]),
  condition: z.enum([
    "is",
    "isNot",
    "hasAny",
    "hasAll",
    "contains",
    "isSet",
    "isEmpty",
    "isWithin",
  ]),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

// Recursive filter group: clauses may be leaf clauses or nested groups.
const groupSchema: z.ZodType = z.lazy(() =>
  z.object({
    op: z.enum(["and", "or"]),
    clauses: z.array(z.union([clauseSchema, groupSchema])),
  }),
);

const sortSchema = z.object({
  field: z.enum(["priority", "dueDate", "title", "createdAt", "updatedAt", "status"]),
  direction: z.enum(["asc", "desc"]),
});

const viewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  filter: groupSchema,
  sort: sortSchema.optional(),
  groupBy: z.enum(["status", "priority", "label", "assignee"]).nullable().optional(),
  layout: z.enum(["board", "list"]).optional(),
  visibleBadges: z.array(z.string()).optional(),
});

export const saveView = defineCommand({
  name: "saveView",
  description: "Save (create or update) a named filter/sort view on a board.",
  input: z.object({ view: viewSchema }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    // The schema validated the shape; cast the recursive filter to the domain type.
    syncSaveView(
      doc,
      { ...input.view, filter: input.view.filter as Filter } as SavedView,
      ctx.now(),
    );
    return { id: input.view.id };
  },
});

export const deleteView = defineCommand({
  name: "deleteView",
  description: "Delete a saved view from a board.",
  input: z.object({ viewId: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncDeleteView(doc, input.viewId, ctx.now());
    return { id: input.viewId, views: listViews(doc).length };
  },
});
