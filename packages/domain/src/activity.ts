// Board activity log. Introduced in Unit 2.12 for status changes; Unit 4.3
// (history/activity feed) expands the event set and adds a UI. Kept minimal and
// extensible: `type` is the discriminant, and new event kinds add fields.
import type { Status } from "./status";

export interface StatusChangeActivity {
  id: string;
  type: "status";
  cardId: string;
  /** null when the card had no prior status recorded (first assignment). */
  from: Status | null;
  to: Status;
  at: number;
  /** Yjs clientId (or user id later) that made the change. */
  actor?: string;
}

/** Union of activity entries. Widened as later units add event kinds. */
export type ActivityEntry = StatusChangeActivity;
