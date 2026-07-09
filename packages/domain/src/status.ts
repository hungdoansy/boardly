// Workflow status (Linear-style), independent of a card's column.
// This is the shared enum the Yjs schema and the command layer need from
// Unit 1.7 onward. Categories, per-status color/icon, transitions, and
// activity logging are layered on in Unit 2.12.
export const Status = {
  Backlog: "backlog",
  Todo: "todo",
  InProgress: "in_progress",
  InReview: "in_review",
  Done: "done",
  Canceled: "canceled",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const STATUS_VALUES = Object.values(Status) as Status[];

/** New cards default to Todo. */
export const DEFAULT_STATUS: Status = Status.Todo;
