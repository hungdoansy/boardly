// Plain-TS mirrors of the Yjs board shape. Framework-agnostic; these are the
// shapes the command layer returns (JSON-serializable, agent-friendly). The
// Yjs types themselves live in `@boardly/sync`.
//
// `status` is added to `Card` in Unit 2.12 (workflow status), alongside
// `packages/domain/src/status.ts`.
import type { LinkProvider, PriorityValue } from "./enums";
import type { Id } from "./ids";
import type { Status } from "./status";

/** A due date, stored structured (never a JSON string). `at` is epoch ms. */
export interface DueDate {
  at: number;
  hasTime: boolean;
}

export interface Label {
  id: Id;
  name: string;
  color: string;
  ord: string;
}

/** A grouping under the single board (Linear-style). A card belongs to one. */
export interface Project {
  id: Id;
  name: string;
  color: string;
  ord: string;
  archived: boolean;
}

export interface ChecklistItem {
  id: Id;
  text: string;
  done: boolean;
  ord: string;
}

export interface CardLink {
  id: Id;
  url: string;
  provider: LinkProvider;
  /** Unfurled title for generic links (known providers use bundled labels). */
  title?: string;
  /** Reference to a bundled icon for known providers. */
  iconRef?: string;
  ord: string;
}

export interface Card {
  id: Id;
  /** Stored integer ticket sequence, from the board's single counter. */
  number: number;
  /**
   * Derived, display-only ticket id computed at read time from the board prefix
   * + `number` (`#42` when the prefix is empty, `TEC-42` when set). Never stored.
   */
  shortId: string;
  title: string;
  description: string;
  /** The project this card belongs to (grouping only; unset = no project). */
  projectId?: Id;
  ord: string;
  /**
   * Workflow status — the SINGLE placement axis since Unit 7. A card renders in
   * the fixed board column that matches its `status`; there is no separate
   * `columnId`. Within a status group, cards are ordered by `ord`.
   */
  status: Status;
  priority: PriorityValue;
  dueDate: DueDate | null;
  assigneeId?: Id;
  labelIds: Id[];
  /** Untyped, symmetric relations to other cards (Unit 9.1). Sorted by id. */
  relatedIds: Id[];
  checklist: ChecklistItem[];
  links: CardLink[];
  archived: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: Id;
}

export interface Board {
  /**
   * The owning user's id. There is exactly one board doc per user, addressed by
   * this id (`board:{userId}`); there is no separately-chosen board id.
   */
  id: Id;
  title: string;
  icon?: string;
  description?: string;
  /** Display-only ticket prefix: uppercase, ≤5 chars, may be empty. */
  shortIdPrefix: string;
  /** Single board-wide counter; the next card's `number` is `shortIdSeq + 1`. */
  shortIdSeq: number;
  /** Ordered field keys shown in the card-face badge row (Unit 2.6). */
  badgeConfig: string[];
  /**
   * Board toolbar toggle (Unit 7): when false, status columns with no cards are
   * hidden. Synced board meta; defaults to `true` when absent.
   */
  showEmptyColumns: boolean;
  createdAt: number;
  updatedAt: number;
}
