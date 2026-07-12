// Per-card activity log. Introduced in Unit 2.12 for status changes; Unit 4.3
// (history/activity feed) expands the event set and adds a UI. Append-only:
// entries are never rewritten, so the log is a faithful, CRDT-safe history.
// `type` is the discriminant; each kind adds only the fields it needs.
import type { PriorityValue } from "./enums";
import type { Status } from "./status";

interface ActivityBase {
  id: string;
  cardId: string;
  /** Event time (ms since epoch). */
  at: number;
  /** Yjs clientId or user id that made the change. */
  actor?: string;
}

/** A card was created. */
export interface CreatedActivity extends ActivityBase {
  type: "created";
}

/** A card moved to a different column. `from` is null if not recorded. */
export interface MovedActivity extends ActivityBase {
  type: "moved";
  from: string | null;
  to: string;
}

/** A card's title changed. */
export interface RenamedActivity extends ActivityBase {
  type: "renamed";
  to: string;
}

/** A card's workflow status changed. `from` is null on first assignment. */
export interface StatusChangeActivity extends ActivityBase {
  type: "status";
  from: Status | null;
  to: Status;
}

/** A card's priority changed. */
export interface PriorityChangeActivity extends ActivityBase {
  type: "priority";
  from: PriorityValue;
  to: PriorityValue;
}

/** A card's due date was set or cleared (null = cleared). */
export interface DueChangeActivity extends ActivityBase {
  type: "due";
  to: number | null;
}

/** A card was archived. */
export interface ArchivedActivity extends ActivityBase {
  type: "archived";
}

/** Union of activity entries. Widen this as later units add event kinds. */
export type ActivityEntry =
  | CreatedActivity
  | MovedActivity
  | RenamedActivity
  | StatusChangeActivity
  | PriorityChangeActivity
  | DueChangeActivity
  | ArchivedActivity;

export type ActivityType = ActivityEntry["type"];
