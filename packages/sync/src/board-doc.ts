// Typed accessors for a board Y.Doc. Every mutation is a single Yjs
// transaction touching typed keys (never an opaque bag, never an array-of-ids
// rewrite). A move is a `columnId` + `ord` write only. Soft-delete sets
// `archived` + `deletedAt`; deleting a column does NOT reparent its cards —
// `reclaimCards` surfaces orphans instead. `now` is injected so the logic
// stays pure/testable.
import {
  type Board,
  type Card,
  type Column,
  type PriorityValue,
  type SeverityValue,
  Priority,
  byOrd,
  compareOrd,
  formatShortId,
  keyBetween,
  newId,
} from "@boardly/domain";
import * as Y from "yjs";

import {
  type YCard,
  boardCards,
  boardColumns,
  boardMeta,
  boardToPlain,
  cardToPlain,
  columnToPlain,
  getBool,
  getString,
  getNumber,
} from "./schema";

// ----- internal helpers -----

function maxOrd(ords: string[]): string | null {
  let max: string | null = null;
  for (const ord of ords) {
    if (max === null || compareOrd(ord, max) > 0) max = ord;
  }
  return max;
}

function rawLiveCardsInColumn(doc: Y.Doc, columnId: string): YCard[] {
  return [...boardCards(doc).values()].filter(
    (c) => getString(c, "columnId") === columnId && !getBool(c, "archived"),
  );
}

function ordOfCard(doc: Y.Doc, cardId: string): string | null {
  const c = boardCards(doc).get(cardId);
  return c instanceof Y.Map ? getString(c, "ord") : null;
}

function ordOfColumn(doc: Y.Doc, columnId: string): string | null {
  const c = boardColumns(doc).get(columnId);
  return c instanceof Y.Map ? getString(c, "ord") : null;
}

/** Neighbors around a target slot: the item is placed after `afterId`, before `beforeId`. */
export interface Neighbors {
  afterId?: string | null;
  beforeId?: string | null;
}

// ----- board meta -----

export interface InitBoardParams {
  title: string;
  icon?: string;
  shortIdPrefix?: string;
  now: number;
  createdBy?: string;
}

/** Initialize a fresh board doc's meta (idempotent — no-op if already set). */
export function initBoard(doc: Y.Doc, params: InitBoardParams): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    if (meta.has("createdAt")) return;
    meta.set("title", params.title);
    if (params.icon !== undefined) meta.set("icon", params.icon);
    meta.set("description", new Y.Text());
    meta.set("shortIdPrefix", params.shortIdPrefix ?? "BRD");
    meta.set("shortIdSeq", 0);
    meta.set("badgeConfig", ["severity", "dueDate", "labels", "links"]);
    meta.set("createdAt", params.now);
    meta.set("updatedAt", params.now);
    if (params.createdBy !== undefined) meta.set("createdBy", params.createdBy);
  });
}

export function renameBoard(doc: Y.Doc, title: string, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("title", title);
    meta.set("updatedAt", now);
  });
}

export function getBoard(doc: Y.Doc, id: string): Board {
  return boardToPlain(doc, id);
}

// ----- columns -----

export interface AddColumnParams {
  id?: string;
  title: string;
  now: number;
  clientId: string;
}

export function addColumn(doc: Y.Doc, params: AddColumnParams): string {
  const id = params.id ?? newId();
  doc.transact(() => {
    const cols = boardColumns(doc);
    const lastOrd = maxOrd(
      [...cols.values()].filter((c) => !getBool(c, "archived")).map((c) => getString(c, "ord")),
    );
    const col = new Y.Map<unknown>();
    col.set("id", id);
    col.set("title", params.title);
    col.set("ord", keyBetween(lastOrd, null, params.clientId));
    col.set("archived", false);
    cols.set(id, col);
    boardMeta(doc).set("updatedAt", params.now);
  });
  return id;
}

export function renameColumn(doc: Y.Doc, columnId: string, title: string, now: number): void {
  doc.transact(() => {
    const col = boardColumns(doc).get(columnId);
    if (!(col instanceof Y.Map)) return;
    col.set("title", title);
    boardMeta(doc).set("updatedAt", now);
  });
}

export function moveColumn(
  doc: Y.Doc,
  columnId: string,
  neighbors: Neighbors,
  clientId: string,
  now: number,
): void {
  doc.transact(() => {
    const col = boardColumns(doc).get(columnId);
    if (!(col instanceof Y.Map)) return;
    const afterOrd = neighbors.afterId ? ordOfColumn(doc, neighbors.afterId) : null;
    const beforeOrd = neighbors.beforeId ? ordOfColumn(doc, neighbors.beforeId) : null;
    col.set("ord", keyBetween(afterOrd, beforeOrd, clientId));
    boardMeta(doc).set("updatedAt", now);
  });
}

/** Soft-delete a column. Cards keep their `columnId`; `reclaimCards` surfaces them. */
export function archiveColumn(doc: Y.Doc, columnId: string, now: number): void {
  doc.transact(() => {
    const col = boardColumns(doc).get(columnId);
    if (!(col instanceof Y.Map)) return;
    col.set("archived", true);
    col.set("deletedAt", now);
    boardMeta(doc).set("updatedAt", now);
  });
}

// ----- cards -----

export interface AddCardParams {
  id?: string;
  columnId: string;
  title: string;
  now: number;
  clientId: string;
  createdBy?: string;
}

export function addCard(doc: Y.Doc, params: AddCardParams): string {
  const id = params.id ?? newId();
  doc.transact(() => {
    const meta = boardMeta(doc);
    const cards = boardCards(doc);
    const seq = getNumber(meta, "shortIdSeq") + 1;
    meta.set("shortIdSeq", seq);
    const lastOrd = maxOrd(
      rawLiveCardsInColumn(doc, params.columnId).map((c) => getString(c, "ord")),
    );
    const card = new Y.Map<unknown>();
    card.set("id", id);
    card.set("shortId", formatShortId(getString(meta, "shortIdPrefix", "BRD"), seq));
    card.set("title", params.title);
    card.set("description", new Y.Text());
    card.set("columnId", params.columnId);
    card.set("ord", keyBetween(lastOrd, null, params.clientId));
    card.set("priority", Priority.None);
    card.set("severity", null);
    card.set("dueDate", null);
    card.set("labels", new Y.Map<unknown>());
    card.set("checklist", new Y.Map<unknown>());
    card.set("links", new Y.Map<unknown>());
    card.set("archived", false);
    card.set("createdAt", params.now);
    card.set("updatedAt", params.now);
    if (params.createdBy !== undefined) card.set("createdBy", params.createdBy);
    cards.set(id, card);
    meta.set("updatedAt", params.now);
  });
  return id;
}

function withCard(doc: Y.Doc, cardId: string, mutate: (card: YCard) => void, now: number): void {
  doc.transact(() => {
    const card = boardCards(doc).get(cardId);
    if (!(card instanceof Y.Map)) return;
    mutate(card);
    card.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
  });
}

export function setCardTitle(doc: Y.Doc, cardId: string, title: string, now: number): void {
  withCard(doc, cardId, (card) => card.set("title", title), now);
}

export function setCardPriority(
  doc: Y.Doc,
  cardId: string,
  priority: PriorityValue,
  now: number,
): void {
  withCard(doc, cardId, (card) => card.set("priority", priority), now);
}

export function setCardSeverity(
  doc: Y.Doc,
  cardId: string,
  severity: SeverityValue | null,
  now: number,
): void {
  withCard(doc, cardId, (card) => card.set("severity", severity), now);
}

/**
 * Move a card to `toColumnId` at the slot between the neighbors. A single
 * `columnId` + `ord` write — concurrent moves of the same card resolve by Yjs
 * LWW to exactly one column (no duplicate).
 */
export function moveCard(
  doc: Y.Doc,
  cardId: string,
  toColumnId: string,
  neighbors: Neighbors,
  clientId: string,
  now: number,
): void {
  doc.transact(() => {
    const card = boardCards(doc).get(cardId);
    if (!(card instanceof Y.Map)) return;
    const afterOrd = neighbors.afterId ? ordOfCard(doc, neighbors.afterId) : null;
    const beforeOrd = neighbors.beforeId ? ordOfCard(doc, neighbors.beforeId) : null;
    card.set("columnId", toColumnId);
    card.set("ord", keyBetween(afterOrd, beforeOrd, clientId));
    card.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
  });
}

/** Soft-delete a card: removed from selectors, kept in the map (for undo/sync). */
export function archiveCard(doc: Y.Doc, cardId: string, now: number): void {
  withCard(
    doc,
    cardId,
    (card) => {
      card.set("archived", true);
      card.set("deletedAt", now);
    },
    now,
  );
}

// ----- selectors (read-only) -----

export function liveColumns(doc: Y.Doc): Column[] {
  return [...boardColumns(doc).values()]
    .filter((c) => !getBool(c, "archived"))
    .map(columnToPlain)
    .sort(byOrd);
}

export function cardsInColumn(doc: Y.Doc, columnId: string): Card[] {
  return [...boardCards(doc).values()]
    .filter((c) => getString(c, "columnId") === columnId && !getBool(c, "archived"))
    .map(cardToPlain)
    .sort(byOrd);
}

/** Non-archived cards whose `columnId` points at no live column ("Unsorted"). */
export function reclaimCards(doc: Y.Doc): Card[] {
  const live = new Set(liveColumns(doc).map((c) => c.id));
  return [...boardCards(doc).values()]
    .filter((c) => !getBool(c, "archived") && !live.has(getString(c, "columnId")))
    .map(cardToPlain)
    .sort(byOrd);
}

export function getCard(doc: Y.Doc, cardId: string): Card | null {
  const c = boardCards(doc).get(cardId);
  return c instanceof Y.Map ? cardToPlain(c) : null;
}
