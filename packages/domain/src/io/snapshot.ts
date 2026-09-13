// Board import/export snapshot: a plain, JSON-serializable, full-fidelity
// mirror of a board (cards, all fields, projects, labels, saved views, board
// display preferences, order). Since Unit 7 there is no `Column` entity and no
// `columnId`: a card's placement is its `status`. The zod schema is the
// validation boundary for imported files (Unit 4.4) and is reused by the
// `importBoard` command so the agent surface validates identically.
//
// Versioning (UNIT-21 / R2, R3, KTD2)
// -----------------------------------
// v1 (Unit 4.4) carried only `board` (title/icon/description/shortIdPrefix/
// badgeConfig), `labels` and live `cards`. v2 widens it to the whole doc:
// `projects`, per-card `projectId`, archived cards with their `deletedAt`,
// board `showEmptyColumns`/`zoom`, and saved `views`.
//
// Every v2 addition carries a zod default, so a v1 file parses as
// "v2 with no projects and no views" — no migration function, and the sections
// a file predates are absent rather than errors. Nothing v1 could carry moved
// or was renamed: an already-shipped v1 reader strips unknown keys *silently*,
// so restructuring a field it knows would lose data with no error at all.
//
// `ord` is optional on cards, labels and projects (R23): a caller authoring a
// snapshot by hand cannot be expected to invent valid fractional-index keys, so
// they are generated at write time, in array order.
import { z } from "zod";

import {
  FILTER_CONDITIONS,
  FILTER_FIELDS,
  GROUP_BY_FIELDS,
  SORT_DIRECTIONS,
  SORT_FIELDS,
  VIEW_LAYOUTS,
  type FilterGroup,
} from "../filters";
import { STATUS_VALUES, type Status } from "../status";
import { DEFAULT_ZOOM } from "../zoom";

/**
 * Bumped when the snapshot shape changes. A file at or below this version is
 * read (older sections default); a file above it is rejected outright rather
 * than best-effort read — silently dropping sections a newer writer added is
 * exactly how the v1 fidelity gap went unnoticed.
 */
export const SNAPSHOT_VERSION = 2;

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
  /** Optional (R23): generated in array order when the author omitted it. */
  ord: z.string().optional(),
});

/** A project (Unit 20). New in v2 — a v1 file simply has none. */
const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  ord: z.string().optional(),
  archived: z.boolean().default(false),
  /** When the project was archived, mirroring `card.deletedAt`. */
  deletedAt: z.number().optional(),
});

// ----- Saved views (Unit 4.1; new in v2) -----
//
// The enums derive from the runtime tuples in `../filters`, so a new filter
// field or sort key cannot become unrepresentable in the interchange format
// without touching the declaration the evaluator itself switches on.

const filterClauseSchema = z.object({
  field: z.enum(FILTER_FIELDS),
  condition: z.enum(FILTER_CONDITIONS),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

// Recursive filter group: clauses are leaf clauses or nested groups.
const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(["and", "or"]),
    clauses: z.array(z.union([filterClauseSchema, filterGroupSchema])),
  }),
);

const sortSchema = z.object({
  field: z.enum(SORT_FIELDS),
  direction: z.enum(SORT_DIRECTIONS),
});

const savedViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  filter: filterGroupSchema,
  sort: sortSchema.optional(),
  groupBy: z.enum(GROUP_BY_FIELDS).nullable().optional(),
  layout: z.enum(VIEW_LAYOUTS).optional(),
  visibleBadges: z.array(z.string()).optional(),
});

const statusSchema = z.enum(STATUS_VALUES as [Status, ...Status[]]).default("todo");

const cardSchema = z.object({
  id: z.string(),
  number: z.number().int().nonnegative().default(0),
  title: z.string(),
  description: z.string().default(""),
  /** The card's project (new in v2). Absent = no project. */
  projectId: z.string().optional(),
  /** Optional (R23): generated in array order when the author omitted it. */
  ord: z.string().optional(),
  status: statusSchema,
  priority: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .default(0),
  dueDate: dueDateSchema.nullable().default(null),
  assigneeId: z.string().optional(),
  labelIds: z.array(z.string()).default([]),
  relatedIds: z.array(z.string()).default([]),
  checklist: z.array(checklistItemSchema).default([]),
  links: z.array(linkSchema).default([]),
  archived: z.boolean().default(false),
  /** When the card was archived (soft delete). New in v2, with `archived`. */
  deletedAt: z.number().optional(),
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
    /** Board display preferences (new in v2). */
    showEmptyColumns: z.boolean().default(true),
    zoom: z.number().default(DEFAULT_ZOOM),
  }),
  /** New in v2; a v1 file yields an empty list, never a missing key. */
  projects: z.array(projectSchema).default([]),
  labels: z.array(labelSchema).default([]),
  /** New in v2 (board meta `views`). */
  views: z.array(savedViewSchema).default([]),
  cards: z.array(cardSchema).default([]),
});

export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type SnapshotCard = z.infer<typeof cardSchema>;
export type SnapshotLabel = z.infer<typeof labelSchema>;
export type SnapshotProject = z.infer<typeof projectSchema>;
export type SnapshotView = z.infer<typeof savedViewSchema>;
