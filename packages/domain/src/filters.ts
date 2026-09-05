// Saved views: a nestable, pure filter model over cards, plus sort. Kept
// framework-agnostic and side-effect-free so evaluation is fully unit-testable
// and runs identically on any client. Persisted per board (Unit 4.1).
import { PRIORITY_META, Priority, type PriorityValue } from "./enums";
import { STATUS_META, Status, STATUS_ORDER } from "./status";
import type { Card } from "./types";

// The filter vocabulary is declared as runtime tuples (the `STATUS_VALUES`
// pattern) so the zod schemas that validate saved views at the import boundary
// (`io/snapshot.ts`, UNIT-21) derive from the same list the evaluator switches
// on. A new field or condition therefore cannot become unrepresentable in the
// interchange format without someone touching this line.
export const FILTER_FIELDS = [
  "status",
  "priority",
  "label",
  "dueDate",
  "assignee",
  "title",
  "project",
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const FILTER_CONDITIONS = [
  "is", // scalar equals one of `values`
  "isNot", // scalar equals none of `values`
  "hasAny", // set (labels) intersects `values`
  "hasAll", // set (labels) contains all of `values`
  "contains", // substring (title), case-insensitive
  "isSet", // field present / non-null
  "isEmpty", // field absent / null / empty
  "isWithin", // dueDate window: "overdue" | "today" | "week"
] as const;
export type FilterCondition = (typeof FILTER_CONDITIONS)[number];

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
    case "project":
      if (clause.condition === "isEmpty") return card.projectId === undefined;
      if (clause.condition === "isSet") return card.projectId !== undefined;
      if (clause.condition === "isNot")
        return card.projectId === undefined || !values.includes(card.projectId);
      // "is" — the card belongs to one of the given projects.
      return card.projectId !== undefined && values.includes(card.projectId);
    default:
      return true;
  }
}

/** Settable card fields a new card can inherit from the active filter (Unit 9.5). */
export interface CardDefaults {
  projectId?: string;
  priority?: PriorityValue;
  labelIds?: string[];
}

/**
 * Derive seed values for a new card from the active filter, so a card created
 * while a filter is applied satisfies it. Only the TOP-LEVEL **AND** group's
 * direct clauses are read: `priority is X` / `project is X` (single value only —
 * a card has exactly one of each) and `label hasAny/hasAll [...]` (all values,
 * which satisfies either condition). A top-level OR, nested groups, negations,
 * ranges, and title/assignee/status clauses are ignored (ambiguous, or not a
 * create-time field — status is the column). Empty/absent seeds → `{}`.
 */
export function deriveCardDefaults(filter: Filter): CardDefaults {
  const defaults: CardDefaults = {};
  if (filter.op !== "and") return defaults;
  const labelIds: string[] = [];
  for (const node of filter.clauses) {
    if (isFilterGroup(node)) continue;
    const values = node.values ?? [];
    if (node.field === "priority" && node.condition === "is" && values.length === 1) {
      defaults.priority = values[0] as PriorityValue;
    } else if (node.field === "project" && node.condition === "is" && values.length === 1) {
      defaults.projectId = String(values[0]);
    } else if (
      node.field === "label" &&
      (node.condition === "hasAny" || node.condition === "hasAll")
    ) {
      for (const v of values) labelIds.push(String(v));
    }
  }
  if (labelIds.length > 0) defaults.labelIds = labelIds;
  return defaults;
}

/** The three sources the board's effective filter is composed from (Unit 20). */
export interface BoardFilterInput {
  /** The active view's filter; `emptyFilter()` when the user has filtered nothing. */
  viewFilter: Filter;
  /** The project scope from the URL — `null` is the "All" scope. */
  selectedProjectId: string | null;
  /** Hidden (archived) project ids. Only ever excluded from "All". */
  hiddenProjectIds: string[];
}

/**
 * The board's one effective filter: the active view narrowed by the project
 * scope, or — in "All" — narrowed to leave out hidden projects (Unit 20).
 * Composing both here means every card list (columns, per-status counts,
 * swimlanes, list view, column bulk actions) inherits them with no extra
 * plumbing, which is the point of expressing scope as a clause (Unit 6.7).
 * `undefined` means "no filter" and is what the empty result collapses to, so
 * callers hand the result straight to {@link countByStatus} /
 * {@link visibleCardIdsByStatus} / {@link resolveView} without re-checking.
 *
 * Two rules here look arbitrary and are not:
 *
 * - **An explicit project scope beats the hidden-project exclusion.** ANDing
 *   both would read `project is X AND project isNot [X, …]` — an empty board —
 *   and navigating to the URL is the only way back to a hidden project's cards
 *   besides search. So `hiddenProjectIds` is ignored whenever a project is
 *   selected, leaving that branch exactly as it was before Unit 20.
 * - **The exclusion is appended to an AND view filter, never wrapped around
 *   it.** {@link deriveCardDefaults} reads only the *direct* clauses of a
 *   top-level AND, so pushing the view filter one level down would silently
 *   stop a `priority is High` view from seeding new cards (Unit 9.5). An OR
 *   view filter must nest instead — spreading its arms would AND them.
 *
 * Exclusion leans on `project` + `isNot` already meaning "no project, or not
 * one of these", so cards with no project at all stay visible in "All".
 */
export function composeBoardFilter({
  viewFilter,
  selectedProjectId,
  hiddenProjectIds,
}: BoardFilterInput): Filter | undefined {
  if (selectedProjectId) {
    const projectClause: FilterClause = {
      field: "project",
      condition: "is",
      values: [selectedProjectId],
    };
    return {
      op: "and",
      clauses: isEmptyFilter(viewFilter) ? [projectClause] : [viewFilter, projectClause],
    };
  }
  if (hiddenProjectIds.length === 0) return isEmptyFilter(viewFilter) ? undefined : viewFilter;
  const kept: Array<FilterClause | FilterGroup> = isEmptyFilter(viewFilter)
    ? [] // also drops an empty OR group, which would just be noise
    : viewFilter.op === "and"
      ? viewFilter.clauses
      : [viewFilter];
  return {
    op: "and",
    clauses: [...kept, { field: "project", condition: "isNot", values: hiddenProjectIds }],
  };
}

/**
 * Count cards per status, applying `filter` (absent/empty → count all). Every
 * status is present in the result (0 when none). Used by the board to decide
 * which columns are empty *under the active filter* (Unit 9.6) so the hide-empty
 * toggle and the column header counts agree with what the columns render.
 */
export function countByStatus(
  cards: Card[],
  filter: Filter | undefined,
  ctx: FilterContext = { now: 0 },
): Record<Status, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
  const active = filter && !isEmptyFilter(filter) ? filter : null;
  for (const card of cards) {
    if (active && !evaluateFilter(card, active, ctx)) continue;
    counts[card.status] = (counts[card.status] ?? 0) + 1;
  }
  return counts;
}

/**
 * The ids of the cards each status column would show under `filter`, grouped by
 * status. Mirrors {@link countByStatus} exactly (same empty-filter short-circuit
 * and `evaluateFilter`), so the per-column id list and the header count agree by
 * construction — the board uses this to bulk-archive a column's *visible* cards.
 */
export function visibleCardIdsByStatus(
  cards: Card[],
  filter: Filter | undefined,
  ctx: FilterContext = { now: 0 },
): Record<Status, string[]> {
  const ids = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as string[]])) as Record<
    Status,
    string[]
  >;
  const active = filter && !isEmptyFilter(filter) ? filter : null;
  for (const card of cards) {
    if (active && !evaluateFilter(card, active, ctx)) continue;
    (ids[card.status] ??= []).push(card.id);
  }
  return ids;
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

export const SORT_FIELDS = [
  "priority",
  "dueDate",
  "title",
  "createdAt",
  "updatedAt",
  "status",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface Sort {
  field: SortField;
  direction: SortDirection;
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

// ----- Grouping (swimlanes, Unit 4.2) -----

export const GROUP_BY_FIELDS = ["status", "priority", "label", "assignee"] as const;
export type GroupByField = (typeof GROUP_BY_FIELDS)[number];

export interface CardGroup {
  /** Group value; `""` is the ungrouped/missing lane (No priority, Unassigned, …). */
  key: string;
  cards: Card[];
}

/**
 * Keys a card belongs to for a group-by field. `""` = missing; labels are
 * multi-valued. `default` also covers an unrecognized/legacy field value
 * (e.g. a saved view's `groupBy` from before a field was removed) — it lands
 * every card in the ungrouped lane rather than the caller iterating
 * `undefined`.
 */
function groupKeys(card: Card, field: GroupByField): string[] {
  switch (field) {
    case "status":
      return [card.status];
    case "priority":
      return [card.priority === Priority.None ? "" : String(card.priority)];
    case "assignee":
      return [card.assigneeId ?? ""];
    case "label":
      return card.labelIds.length ? card.labelIds : [""];
    default:
      return [""];
  }
}

// Natural order for enum fields; `""` (ungrouped) always sorts last.
const PRIORITY_GROUP_ORDER = [Priority.Urgent, Priority.High, Priority.Medium, Priority.Low].map(
  String,
);
const rankFor = (field: GroupByField, key: string, firstSeen: number): number => {
  if (key === "") return Number.POSITIVE_INFINITY; // ungrouped lane last
  if (field === "priority") return PRIORITY_GROUP_ORDER.indexOf(key);
  if (field === "status") return STATUS_ORDER.indexOf(key as (typeof STATUS_ORDER)[number]);
  return firstSeen; // label / assignee: order of first appearance
};

/**
 * Partition cards into ordered lanes for a group-by field. Label grouping is
 * multi-valued (a card appears in each of its label lanes); a card missing the
 * field lands in the trailing `""` (ungrouped) lane. Card order within a lane
 * follows the input order.
 */
export function groupCards(cards: Card[], groupBy: GroupByField): CardGroup[] {
  const buckets = new Map<string, Card[]>();
  const firstSeen = new Map<string, number>();
  let seq = 0;
  for (const card of cards) {
    for (const key of groupKeys(card, groupBy)) {
      if (!buckets.has(key)) {
        buckets.set(key, []);
        firstSeen.set(key, seq++);
      }
      buckets.get(key)!.push(card);
    }
  }
  return [...buckets.entries()]
    .map(([key, laneCards]) => ({ key, cards: laneCards }))
    .sort(
      (a, b) =>
        rankFor(groupBy, a.key, firstSeen.get(a.key)!) -
        rankFor(groupBy, b.key, firstSeen.get(b.key)!),
    );
}

/**
 * Human label for a swimlane. Enum fields resolve to their display names; the
 * empty key is the ungrouped lane ("No priority", "Unassigned", …). Label and
 * assignee keys are opaque ids — pass `labelName` to resolve a label's name;
 * an assignee key falls back to the raw id (no user directory yet). An
 * unrecognized/legacy `groupBy` (e.g. a saved view's field from before it was
 * removed) resolves to a generic "Ungrouped" rather than `undefined` — this
 * is called directly by swimlane/list-view rendering, not only through
 * `groupCards`.
 */
export function groupLabel(
  groupBy: GroupByField,
  key: string,
  opts?: { labelName?: string },
): string {
  if (key === "") {
    switch (groupBy) {
      case "priority":
        return "No priority";
      case "label":
        return "No label";
      case "assignee":
        return "Unassigned";
      case "status":
        return "No status";
      default:
        return "Ungrouped";
    }
  }
  switch (groupBy) {
    case "status":
      return STATUS_META[key as Status]?.name ?? key;
    case "priority":
      return PRIORITY_META[Number(key) as PriorityValue]?.name ?? key;
    case "label":
      return opts?.labelName ?? key;
    case "assignee":
      return key;
    default:
      return "Ungrouped";
  }
}

// ----- View resolution (one model, two lenses — Unit V1.1) -----

/** How a view renders: the kanban board or the dense list. Absent → "board". */
export const VIEW_LAYOUTS = ["board", "list"] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];

/**
 * The lens applied to a set of cards, independent of how it renders. Board and
 * list both feed the same `{ filter, sort, groupBy }` through `resolveView` so
 * the two views never re-implement the filter→sort→group pipeline.
 */
export interface ViewLens {
  filter?: Filter;
  sort?: Sort | null;
  groupBy?: GroupByField | null;
}

/** Result of `resolveView`: grouped lanes when `groupBy` is set, else a flat list. */
export type ResolvedView = { grouped: CardGroup[] } | { flat: Card[] };

/**
 * Pure composition of the existing pipeline: filter (empty/absent → all cards),
 * then stable sort (absent → input/board order), then optional grouping. When
 * `groupBy` is set the result is `{ grouped }`; otherwise `{ flat }`. Lanes are
 * internally sorted because grouping runs after sorting.
 */
export function resolveView(cards: Card[], lens: ViewLens, ctx: FilterContext): ResolvedView {
  const { filter, sort, groupBy } = lens;
  const filtered =
    filter && !isEmptyFilter(filter) ? cards.filter((c) => evaluateFilter(c, filter, ctx)) : cards;
  const sorted = sort ? sortCards(filtered, sort) : filtered;
  return groupBy ? { grouped: groupCards(sorted, groupBy) } : { flat: sorted };
}

// ----- Saved views -----

export interface SavedView {
  id: string;
  name: string;
  filter: Filter;
  sort?: Sort;
  /** Swimlane grouping (Unit 4.2); null/undefined → ungrouped columns. */
  groupBy?: GroupByField | null;
  /** Board vs list rendering (Unit V1.1); absent → "board" for back-compat. */
  layout?: ViewLayout;
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
