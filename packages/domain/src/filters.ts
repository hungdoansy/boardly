// Saved views: a nestable, pure filter model over cards, plus sort. Kept
// framework-agnostic and side-effect-free so evaluation is fully unit-testable
// and runs identically on any client. Persisted per board (Unit 4.1).
import { Priority, type PriorityValue } from "./enums";
import { Status } from "./status";
import type { Card } from "./types";

export type FilterField =
  "status" | "priority" | "severity" | "label" | "dueDate" | "assignee" | "title";

export type FilterCondition =
  | "is" // scalar equals one of `values`
  | "isNot" // scalar equals none of `values`
  | "hasAny" // set (labels) intersects `values`
  | "hasAll" // set (labels) contains all of `values`
  | "contains" // substring (title), case-insensitive
  | "isSet" // field present / non-null
  | "isEmpty" // field absent / null / empty
  | "isWithin"; // dueDate window: "overdue" | "today" | "week"

export interface FilterClause {
  field: FilterField;
  condition: FilterCondition;
  /** Operands (label ids, priority numbers, status strings, a substring, a window). */
  values?: Array<string | number>;
}

export interface FilterGroup {
  op: "and" | "or";
  clauses: Array<FilterClause | FilterGroup>;
}

export type Filter = FilterGroup;

/** Injected so evaluation stays pure (date math needs "now"; "me" needs the user). */
export interface FilterContext {
  now: number;
  currentUserId?: string;
}

export const emptyFilter = (): Filter => ({ op: "and", clauses: [] });

export const isFilterGroup = (node: FilterClause | FilterGroup): node is FilterGroup =>
  (node as FilterGroup).clauses !== undefined;

/** A filter with no clauses matches everything (used to mean "no filter"). */
export function isEmptyFilter(filter: Filter): boolean {
  return filter.clauses.length === 0;
}

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function matchesDueWindow(card: Card, window: string, now: number): boolean {
  if (!card.dueDate) return false;
  const due = card.dueDate.at;
  const today0 = startOfDay(now);
  const tomorrow0 = today0 + 86_400_000;
  switch (window) {
    case "overdue":
      return due < today0;
    case "today":
      return due >= today0 && due < tomorrow0;
    case "week":
      return due < today0 + 7 * 86_400_000; // overdue or within the next 7 days
    default:
      return false;
  }
}

function matchesClause(card: Card, clause: FilterClause, ctx: FilterContext): boolean {
  const values = clause.values ?? [];
  switch (clause.field) {
    case "status":
      if (clause.condition === "isNot") return !values.includes(card.status);
      return values.includes(card.status); // is / hasAny treated as "one of"
    case "priority": {
      const p = card.priority;
      if (clause.condition === "isNot") return !values.includes(p);
      if (clause.condition === "isSet") return p !== Priority.None;
      if (clause.condition === "isEmpty") return p === Priority.None;
      return values.includes(p);
    }
    case "severity":
      if (clause.condition === "isSet") return card.severity !== null;
      if (clause.condition === "isEmpty") return card.severity === null;
      if (clause.condition === "isNot")
        return card.severity !== null && !values.includes(card.severity);
      return card.severity !== null && values.includes(card.severity);
    case "label": {
      const ids = card.labelIds;
      if (clause.condition === "isEmpty") return ids.length === 0;
      if (clause.condition === "isSet") return ids.length > 0;
      if (clause.condition === "hasAll") return values.every((v) => ids.includes(String(v)));
      return values.some((v) => ids.includes(String(v))); // hasAny (default)
    }
    case "assignee":
      if (clause.condition === "isSet") return card.assigneeId !== undefined;
      if (clause.condition === "isEmpty") return card.assigneeId === undefined;
      // "is" — resolve the "me" sentinel to the current user.
      return values.some((v) =>
        v === "@me" ? card.assigneeId === ctx.currentUserId : card.assigneeId === v,
      );
    case "dueDate":
      if (clause.condition === "isSet") return card.dueDate !== null;
      if (clause.condition === "isEmpty") return card.dueDate === null;
      if (clause.condition === "isWithin")
        return matchesDueWindow(card, String(values[0] ?? ""), ctx.now);
      return card.dueDate !== null;
    case "title": {
      const needle = String(values[0] ?? "").toLowerCase();
      return needle.length === 0 || card.title.toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}

/** Evaluate a (nestable) filter against a card. Empty group → match. */
export function evaluateFilter(card: Card, filter: Filter, ctx: FilterContext): boolean {
  const results = filter.clauses.map((node) =>
    isFilterGroup(node) ? evaluateFilter(card, node, ctx) : matchesClause(card, node, ctx),
  );
  if (results.length === 0) return true;
  return filter.op === "or" ? results.some(Boolean) : results.every(Boolean);
}

// ----- Sort -----

export type SortField = "priority" | "dueDate" | "title" | "createdAt" | "updatedAt" | "status";
export interface Sort {
  field: SortField;
  direction: "asc" | "desc";
}

const STATUS_RANK: Record<string, number> = {
  [Status.Backlog]: 0,
  [Status.Todo]: 1,
  [Status.InProgress]: 2,
  [Status.InReview]: 3,
  [Status.Done]: 4,
  [Status.Canceled]: 5,
};

function sortKey(card: Card, field: SortField): number | string {
  switch (field) {
    case "priority":
      return card.priority as PriorityValue;
    case "dueDate":
      return card.dueDate?.at ?? Number.POSITIVE_INFINITY; // undated last (asc)
    case "title":
      return card.title.toLowerCase();
    case "createdAt":
      return card.createdAt;
    case "updatedAt":
      return card.updatedAt;
    case "status":
      return STATUS_RANK[card.status] ?? 0;
  }
}

/** Stable sort of a copy of `cards` by the view's sort. */
export function sortCards(cards: Card[], sort: Sort): Card[] {
  const dir = sort.direction === "desc" ? -1 : 1;
  return [...cards].sort((a, b) => {
    const ka = sortKey(a, sort.field);
    const kb = sortKey(b, sort.field);
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    return 0;
  });
}

// ----- Saved views -----

export interface SavedView {
  id: string;
  name: string;
  filter: Filter;
  sort?: Sort;
  /** Applied in Unit 4.2 (swimlanes). Persisted here for forward-compat. */
  groupBy?: FilterField | null;
  /** Overrides the board badge row when set (Unit 2.6). */
  visibleBadges?: string[];
}

/** Built-in views every board offers (not persisted; resolved at render). */
export const PRESET_VIEWS: SavedView[] = [
  {
    id: "preset:my-cards",
    name: "My cards",
    filter: { op: "and", clauses: [{ field: "assignee", condition: "is", values: ["@me"] }] },
  },
  {
    id: "preset:due-week",
    name: "Due this week",
    filter: { op: "and", clauses: [{ field: "dueDate", condition: "isWithin", values: ["week"] }] },
    sort: { field: "dueDate", direction: "asc" },
  },
  {
    id: "preset:high-priority",
    name: "High priority",
    filter: {
      op: "and",
      clauses: [{ field: "priority", condition: "is", values: [Priority.High, Priority.Urgent] }],
    },
    sort: { field: "priority", direction: "desc" },
  },
];
