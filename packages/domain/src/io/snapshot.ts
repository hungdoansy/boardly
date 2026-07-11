// Board import/export snapshot: a plain, JSON-serializable, full-fidelity
// mirror of a board (columns, cards, all fields, labels, order). The zod schema
// is the validation boundary for imported files (Unit 4.4) and is reused by the
// `importBoard` command so the agent surface validates identically.
import { z } from "zod";

import { STATUS_VALUES, type Status } from "../status";

/** Bumped when the snapshot shape changes incompatibly. */
export const SNAPSHOT_VERSION = 1;

/** Thrown when an import file is malformed. Import is atomic: nothing is created. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const dueDateSchema = z.object({ at: z.number(), hasTime: z.boolean() });

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean().default(false),
  ord: z.string(),
});

const linkSchema = z.object({
  id: z.string(),
  url: z.string(),
  provider: z.string().default("generic"),
  title: z.string().optional(),
  iconRef: z.string().optional(),
  ord: z.string(),
});

const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  ord: z.string(),
});

const columnSchema = z.object({
  id: z.string(),
  title: z.string(),
  ord: z.string(),
  wipLimit: z.number().int().positive().optional(),
  archived: z.boolean().default(false),
});

const statusSchema = z.enum(STATUS_VALUES as [Status, ...Status[]]).default("todo");

const cardSchema = z.object({
  id: z.string(),
  number: z.number().int().nonnegative().default(0),
  title: z.string(),
  description: z.string().default(""),
  columnId: z.string(),
  ord: z.string(),
  status: statusSchema,
  priority: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .default(0),
  severity: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .nullable()
    .default(null),
  dueDate: dueDateSchema.nullable().default(null),
  assigneeId: z.string().optional(),
  labelIds: z.array(z.string()).default([]),
  checklist: z.array(checklistItemSchema).default([]),
  links: z.array(linkSchema).default([]),
  archived: z.boolean().default(false),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
  createdBy: z.string().optional(),
});

export const boardSnapshotSchema = z.object({
  version: z.number().default(SNAPSHOT_VERSION),
  board: z.object({
    title: z.string(),
    icon: z.string().optional(),
    description: z.string().optional(),
    shortIdPrefix: z.string().default(""),
    badgeConfig: z.array(z.string()).default([]),
  }),
  labels: z.array(labelSchema).default([]),
  columns: z.array(columnSchema).default([]),
  cards: z.array(cardSchema).default([]),
});

export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type SnapshotColumn = z.infer<typeof columnSchema>;
export type SnapshotCard = z.infer<typeof cardSchema>;
export type SnapshotLabel = z.infer<typeof labelSchema>;
