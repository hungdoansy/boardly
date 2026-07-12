// Workflow status (Linear-style). Since Unit 7 `status` is the SINGLE placement
// axis: a card's column IS its status. The board renders exactly these eight
// fixed columns (no add/rename/reorder/WIP). The shared enum the Yjs schema and
// command layer have needed since Unit 1.7; Unit 2.12 layered categories,
// per-status color/icon, and ordering on top.
export const Status = {
  Backlog: "backlog",
  Todo: "todo",
  InProgress: "in_progress",
  Pending: "pending",
  InReview: "in_review",
  Done: "done",
  Canceled: "canceled",
  Duplicate: "duplicate",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const STATUS_VALUES = Object.values(Status) as Status[];

/** New cards default to Todo. */
export const DEFAULT_STATUS: Status = Status.Todo;

/**
 * Coarse workflow buckets (used for grouping in U4.2 and for card styling:
 * `completed`/`canceled` dim the card face).
 */
export const StatusCategory = {
  Unstarted: "unstarted",
  Started: "started",
  Completed: "completed",
  Canceled: "canceled",
} as const;
export type StatusCategory = (typeof StatusCategory)[keyof typeof StatusCategory];

export interface StatusMeta {
  name: string;
  category: StatusCategory;
  /** Icon accent color (hex, resolves in both themes). */
  color: string;
}

export const STATUS_META: Record<Status, StatusMeta> = {
  [Status.Backlog]: { name: "Backlog", category: StatusCategory.Unstarted, color: "#8a8f98" },
  [Status.Todo]: { name: "Todo", category: StatusCategory.Unstarted, color: "#a0a4ad" },
  [Status.InProgress]: { name: "In Progress", category: StatusCategory.Started, color: "#f2c94c" },
  [Status.Pending]: { name: "Pending", category: StatusCategory.Started, color: "#e2b341" },
  [Status.InReview]: { name: "In Review", category: StatusCategory.Started, color: "#4cb782" },
  [Status.Done]: { name: "Done", category: StatusCategory.Completed, color: "#5e6ad2" },
  [Status.Canceled]: { name: "Canceled", category: StatusCategory.Canceled, color: "#6b7080" },
  [Status.Duplicate]: { name: "Duplicate", category: StatusCategory.Canceled, color: "#565b66" },
};

/**
 * Display order for the fixed board columns and pickers (workflow left→right):
 * Backlog, Todo, Pending, In Progress, In Review, Done, Canceled, Duplicate.
 */
export const STATUS_ORDER: Status[] = [
  Status.Backlog,
  Status.Todo,
  Status.Pending,
  Status.InProgress,
  Status.InReview,
  Status.Done,
  Status.Canceled,
  Status.Duplicate,
];

export const isDoneStatus = (status: Status): boolean =>
  STATUS_META[status].category === StatusCategory.Completed;

export const isCanceledStatus = (status: Status): boolean =>
  STATUS_META[status].category === StatusCategory.Canceled;

/** Whether the card face should be dimmed/struck (done or canceled). */
export const isTerminalStatus = (status: Status): boolean =>
  isDoneStatus(status) || isCanceledStatus(status);
