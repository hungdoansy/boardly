// Yjs board/workspace document schema: top-level type accessors, scalar
// readers, and Y → plain-domain converters. Mutations live in board-doc.ts /
// workspace-doc.ts. Shape follows the plan's High-Level Technical Design:
// flat, id-keyed Y.Maps; `columnId` on the card (no nested arrays); structured
// values (dueDate) as nested Y.Map, never JSON strings; sets (labels) as
// Y.Map<id,true>; description as Y.Text.
import {
  type Board,
  type Card,
  type CardLink,
  type ChecklistItem,
  type Column,
  type DueDate,
  type LinkProvider,
  type PriorityValue,
  type SeverityValue,
  type Status,
  type WorkspaceBoardRef,
  DEFAULT_STATUS,
} from "@boardly/domain";
import * as Y from "yjs";

/** A card / column / label as stored in Yjs (an id-keyed sub-map). */
export type YCard = Y.Map<unknown>;
export type YColumn = Y.Map<unknown>;
export type YLabel = Y.Map<unknown>;

// ----- Top-level document sections -----

export const boardMeta = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>("meta");
export const boardColumns = (doc: Y.Doc): Y.Map<YColumn> => doc.getMap<YColumn>("columns");
export const boardCards = (doc: Y.Doc): Y.Map<YCard> => doc.getMap<YCard>("cards");
export const boardLabels = (doc: Y.Doc): Y.Map<YLabel> => doc.getMap<YLabel>("labels");

/** Workspace index doc: the user's boards. */
export const workspaceBoards = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>("boards");

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

export function columnToPlain(yc: YColumn): Column {
  const col: Column = {
    id: getString(yc, "id"),
    title: getString(yc, "title"),
    ord: getString(yc, "ord"),
    archived: getBool(yc, "archived"),
  };
  const wip = yc.get("wipLimit");
  if (typeof wip === "number") col.wipLimit = wip;
  const del = yc.get("deletedAt");
  if (typeof del === "number") col.deletedAt = del;
  return col;
}

export function cardToPlain(yc: YCard): Card {
  const description = yc.get("description");
  const dueRaw = yc.get("dueDate");
  const labelsRaw = yc.get("labels");
  const checklistRaw = yc.get("checklist");
  const linksRaw = yc.get("links");
  const severity = yc.get("severity");

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

  const card: Card = {
    id: getString(yc, "id"),
    shortId: getString(yc, "shortId"),
    title: getString(yc, "title"),
    description: description instanceof Y.Text ? description.toString() : "",
    columnId: getString(yc, "columnId"),
    ord: getString(yc, "ord"),
    status: getString(yc, "status", DEFAULT_STATUS) as Status,
    priority: getNumber(yc, "priority", 0) as PriorityValue,
    severity: typeof severity === "number" ? (severity as SeverityValue) : null,
    dueDate,
    labelIds,
    checklist,
    links,
    archived: getBool(yc, "archived"),
    createdAt: getNumber(yc, "createdAt"),
    updatedAt: getNumber(yc, "updatedAt"),
  };
  const assignee = yc.get("assigneeId");
  if (typeof assignee === "string") card.assigneeId = assignee;
  const del = yc.get("deletedAt");
  if (typeof del === "number") card.deletedAt = del;
  const createdBy = yc.get("createdBy");
  if (typeof createdBy === "string") card.createdBy = createdBy;
  return card;
}

export function boardToPlain(doc: Y.Doc, id: string): Board {
  const meta = boardMeta(doc);
  const description = meta.get("description");
  const badgeRaw = meta.get("badgeConfig");
  const board: Board = {
    id,
    title: getString(meta, "title"),
    shortIdPrefix: getString(meta, "shortIdPrefix", "BRD"),
    shortIdSeq: getNumber(meta, "shortIdSeq"),
    badgeConfig: Array.isArray(badgeRaw) ? (badgeRaw as string[]) : [],
    createdAt: getNumber(meta, "createdAt"),
    updatedAt: getNumber(meta, "updatedAt"),
  };
  const icon = meta.get("icon");
  if (typeof icon === "string") board.icon = icon;
  if (description instanceof Y.Text) board.description = description.toString();
  return board;
}

export function boardRefToPlain(yr: Y.Map<unknown>): WorkspaceBoardRef {
  const ref: WorkspaceBoardRef = {
    id: getString(yr, "id"),
    title: getString(yr, "title"),
    ord: getString(yr, "ord"),
    archived: getBool(yr, "archived"),
  };
  const icon = yr.get("icon");
  if (typeof icon === "string") ref.icon = icon;
  return ref;
}
