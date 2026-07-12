// Yjs board document schema: top-level type accessors, scalar readers, and
// Y → plain-domain converters. Mutations live in board-doc.ts. There is exactly
// one content doc per user, addressed by the user's id. Shape follows the
// plan's High-Level Technical Design: flat, id-keyed Y.Maps; a card's placement
// is its `status` (no `columnId`, no `Column` entity); structured values
// (dueDate) as nested Y.Map, never JSON strings; sets (labels) as
// Y.Map<id,true>; description as Y.Text.
import {
  type Board,
  type Card,
  type CardLink,
  type ChecklistItem,
  type DueDate,
  type Label,
  type LinkProvider,
  type PriorityValue,
  type Project,
  type Status,
  DEFAULT_BADGE_CONFIG,
  DEFAULT_STATUS,
  formatTicketId,
} from "@boardly/domain";
import * as Y from "yjs";

/** A card / label as stored in Yjs (an id-keyed sub-map). */
export type YCard = Y.Map<unknown>;
export type YLabel = Y.Map<unknown>;

// ----- Top-level document sections -----

export const boardMeta = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>("meta");
export const boardCards = (doc: Y.Doc): Y.Map<YCard> => doc.getMap<YCard>("cards");
export const boardLabels = (doc: Y.Doc): Y.Map<YLabel> => doc.getMap<YLabel>("labels");
export const boardProjects = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>("projects");
/** Append-only activity log (Unit 2.12; expanded in U4.3). */
export const boardActivity = (doc: Y.Doc): Y.Array<Y.Map<unknown>> =>
  doc.getArray<Y.Map<unknown>>("activity");

// ----- Scalar readers (defensive: wrong/absent types fall back to default) -----

export function getString(m: Y.Map<unknown>, key: string, fallback = ""): string {
  const v = m.get(key);
  return typeof v === "string" ? v : fallback;
}

export function getNumber(m: Y.Map<unknown>, key: string, fallback = 0): number {
  const v = m.get(key);
  return typeof v === "number" ? v : fallback;
}

export function getBool(m: Y.Map<unknown>, key: string, fallback = false): boolean {
  const v = m.get(key);
  return typeof v === "boolean" ? v : fallback;
}

// ----- Converters (Y → plain, JSON-serializable domain types) -----

/**
 * Convert a stored card to its plain domain shape. `opts.prefix` is the board's
 * display prefix and `opts.number` optionally overrides the stored number with a
 * repaired one (collision repair-on-read); together they derive `shortId`.
 */
export function cardToPlain(yc: YCard, opts?: { prefix?: string; number?: number }): Card {
  const description = yc.get("description");
  const dueRaw = yc.get("dueDate");
  const labelsRaw = yc.get("labels");
  const checklistRaw = yc.get("checklist");
  const linksRaw = yc.get("links");

  let dueDate: DueDate | null = null;
  if (dueRaw instanceof Y.Map) {
    dueDate = { at: getNumber(dueRaw, "at"), hasTime: getBool(dueRaw, "hasTime") };
  }

  const labelIds = labelsRaw instanceof Y.Map ? Array.from(labelsRaw.keys()) : ([] as string[]);

  const checklist: ChecklistItem[] = [];
  if (checklistRaw instanceof Y.Map) {
    for (const [id, raw] of checklistRaw.entries()) {
      if (raw instanceof Y.Map) {
        checklist.push({
          id,
          text: getString(raw, "text"),
          done: getBool(raw, "done"),
          ord: getString(raw, "ord"),
        });
      }
    }
    checklist.sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));
  }

  const links: CardLink[] = [];
  if (linksRaw instanceof Y.Map) {
    for (const [id, raw] of linksRaw.entries()) {
      if (raw instanceof Y.Map) {
        const link: CardLink = {
          id,
          url: getString(raw, "url"),
          provider: getString(raw, "provider", "generic") as LinkProvider,
          ord: getString(raw, "ord"),
        };
        const title = raw.get("title");
        if (typeof title === "string") link.title = title;
        const iconRef = raw.get("iconRef");
        if (typeof iconRef === "string") link.iconRef = iconRef;
        links.push(link);
      }
    }
    links.sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));
  }

  const prefix = opts?.prefix ?? "";
  const number = opts?.number ?? getNumber(yc, "number");
  const card: Card = {
    id: getString(yc, "id"),
    number,
    shortId: formatTicketId(prefix, number),
    title: getString(yc, "title"),
    description: description instanceof Y.Text ? description.toString() : "",
    ord: getString(yc, "ord"),
    status: getString(yc, "status", DEFAULT_STATUS) as Status,
    priority: getNumber(yc, "priority", 0) as PriorityValue,
    dueDate,
    labelIds,
    checklist,
    links,
    archived: getBool(yc, "archived"),
    createdAt: getNumber(yc, "createdAt"),
    updatedAt: getNumber(yc, "updatedAt"),
  };
  const projectId = yc.get("projectId");
  if (typeof projectId === "string") card.projectId = projectId;
  const assignee = yc.get("assigneeId");
  if (typeof assignee === "string") card.assigneeId = assignee;
  const del = yc.get("deletedAt");
  if (typeof del === "number") card.deletedAt = del;
  const createdBy = yc.get("createdBy");
  if (typeof createdBy === "string") card.createdBy = createdBy;
  return card;
}

/** Convert the per-user board doc to its plain shape; `userId` becomes `Board.id`. */
export function boardToPlain(doc: Y.Doc, userId: string): Board {
  const meta = boardMeta(doc);
  const description = meta.get("description");
  const badgeRaw = meta.get("badgeConfig");
  const board: Board = {
    id: userId,
    title: getString(meta, "title"),
    shortIdPrefix: getString(meta, "shortIdPrefix", ""),
    shortIdSeq: getNumber(meta, "shortIdSeq"),
    // Absent (never initialized) → the default face; an explicit [] means the
    // user cleared every badge, so it is preserved. This read-time default is
    // why the client never needs to WRITE default meta (which would clobber a
    // synced board's real config via last-writer-wins on a fresh device).
    badgeConfig: Array.isArray(badgeRaw) ? (badgeRaw as string[]) : [...DEFAULT_BADGE_CONFIG],
    // Board toolbar preference (Unit 7); defaults to true when absent from meta.
    showEmptyColumns: getBool(meta, "showEmptyColumns", true),
    createdAt: getNumber(meta, "createdAt"),
    updatedAt: getNumber(meta, "updatedAt"),
  };
  const icon = meta.get("icon");
  if (typeof icon === "string") board.icon = icon;
  if (description instanceof Y.Text) board.description = description.toString();
  return board;
}

export function labelToPlain(yl: YLabel): Label {
  return {
    id: getString(yl, "id"),
    name: getString(yl, "name"),
    color: getString(yl, "color"),
    ord: getString(yl, "ord"),
  };
}

export function projectToPlain(yp: Y.Map<unknown>): Project {
  return {
    id: getString(yp, "id"),
    name: getString(yp, "name"),
    color: getString(yp, "color"),
    ord: getString(yp, "ord"),
    archived: getBool(yp, "archived"),
  };
}
