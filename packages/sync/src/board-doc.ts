// Typed accessors for a board Y.Doc. Every mutation is a single Yjs
// transaction touching typed keys (never an opaque bag, never an array-of-ids
// rewrite). A move is a `columnId` + `ord` write only. Soft-delete sets
// `archived` + `deletedAt`; deleting a column does NOT reparent its cards —
// `reclaimCards` surfaces orphans instead. `now` is injected so the logic
// stays pure/testable.
import {
  type ActivityEntry,
  type Board,
  type Card,
  type Column,
  type DueDate,
  type Label,
  type LinkProvider,
  type PriorityValue,
  type SeverityValue,
  type Status,
  DEFAULT_BADGE_CONFIG,
  DEFAULT_STATUS,
  Priority,
  byOrd,
  compareOrd,
  detectProvider,
  formatShortId,
  keyBetween,
  newId,
  normalizeUrl,
  repairShortIds,
} from "@boardly/domain";
import * as Y from "yjs";

import {
  type YCard,
  boardActivity,
  boardCards,
  boardColumns,
  boardLabels,
  boardMeta,
  boardToPlain,
  cardToPlain,
  columnToPlain,
  getBool,
  getString,
  getNumber,
  labelToPlain,
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
    meta.set("badgeConfig", [...DEFAULT_BADGE_CONFIG]);
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

/** Set the ordered card-face badge row config. */
export function setBadgeConfig(doc: Y.Doc, config: string[], now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("badgeConfig", [...config]);
    meta.set("updatedAt", now);
  });
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
    card.set("status", DEFAULT_STATUS);
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
 * Set the workflow status (LWW key, independent of the column). When the value
 * actually changes, append a status-change entry to the board activity log.
 */
export function setCardStatus(
  doc: Y.Doc,
  cardId: string,
  status: Status,
  now: number,
  actor?: string,
): void {
  doc.transact(() => {
    const card = boardCards(doc).get(cardId);
    if (!(card instanceof Y.Map)) return;
    const from = getString(card, "status", DEFAULT_STATUS) as Status;
    if (from === status) return;
    card.set("status", status);
    card.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
    appendActivity(doc, { type: "status", cardId, from, to: status, at: now, actor });
  });
}

/** Append an activity entry (append-only Y.Array of plain-ish Y.Maps). */
export function appendActivity(doc: Y.Doc, entry: Omit<ActivityEntry, "id">): void {
  const row = new Y.Map<unknown>();
  row.set("id", newId());
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined) row.set(key, value);
  }
  boardActivity(doc).push([row]);
}

/** Read the activity log, oldest → newest. */
export function listActivity(doc: Y.Doc): ActivityEntry[] {
  return boardActivity(doc)
    .toArray()
    .filter((row): row is Y.Map<unknown> => row instanceof Y.Map)
    .map((row) => {
      const entry: ActivityEntry = {
        id: getString(row, "id"),
        type: "status",
        cardId: getString(row, "cardId"),
        from: (row.get("from") as Status | undefined) ?? null,
        to: getString(row, "to", DEFAULT_STATUS) as Status,
        at: getNumber(row, "at"),
      };
      const actor = row.get("actor");
      if (typeof actor === "string") entry.actor = actor;
      return entry;
    });
}

/** Set or clear the due date (stored as a nested Y.Map, never a JSON string). */
export function setCardDueDate(doc: Y.Doc, cardId: string, due: DueDate | null, now: number): void {
  withCard(
    doc,
    cardId,
    (card) => {
      if (due === null) {
        card.set("dueDate", null);
        return;
      }
      const map = new Y.Map<unknown>();
      map.set("at", due.at);
      map.set("hasTime", due.hasTime);
      card.set("dueDate", map);
    },
    now,
  );
}

/**
 * Replace a card's description while preserving Y.Text character-level merge:
 * instead of clobbering the whole text, apply the minimal single-range diff
 * (common prefix/suffix trimmed) so concurrent edits at different positions
 * merge cleanly rather than one overwriting the other.
 */
export function setCardDescription(doc: Y.Doc, cardId: string, text: string, now: number): void {
  doc.transact(() => {
    const card = boardCards(doc).get(cardId);
    if (!(card instanceof Y.Map)) return;
    const ytext = card.get("description");
    if (!(ytext instanceof Y.Text)) return;
    const old = ytext.toString();
    if (old === text) return;

    let start = 0;
    const min = Math.min(old.length, text.length);
    while (start < min && old[start] === text[start]) start++;
    let endOld = old.length;
    let endNew = text.length;
    while (endOld > start && endNew > start && old[endOld - 1] === text[endNew - 1]) {
      endOld--;
      endNew--;
    }
    if (endOld > start) ytext.delete(start, endOld - start);
    if (endNew > start) ytext.insert(start, text.slice(start, endNew));

    card.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
  });
}

// ----- checklist -----

function checklistOf(card: YCard): Y.Map<unknown> | null {
  const cl = card.get("checklist");
  return cl instanceof Y.Map ? cl : null;
}

export interface AddChecklistItemParams {
  cardId: string;
  id?: string;
  text: string;
  now: number;
  clientId: string;
}

export function addChecklistItem(doc: Y.Doc, params: AddChecklistItemParams): string {
  const id = params.id ?? newId();
  withCard(
    doc,
    params.cardId,
    (card) => {
      const cl = checklistOf(card);
      if (!cl) return;
      const lastOrd = maxOrd(
        [...cl.values()]
          .filter((i): i is Y.Map<unknown> => i instanceof Y.Map)
          .map((i) => getString(i, "ord")),
      );
      const item = new Y.Map<unknown>();
      item.set("text", params.text);
      item.set("done", false);
      item.set("ord", keyBetween(lastOrd, null, params.clientId));
      cl.set(id, item);
    },
    params.now,
  );
  return id;
}

function withChecklistItem(
  doc: Y.Doc,
  cardId: string,
  itemId: string,
  mutate: (item: Y.Map<unknown>) => void,
  now: number,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const item = checklistOf(card)?.get(itemId);
      if (item instanceof Y.Map) mutate(item);
    },
    now,
  );
}

export function toggleChecklistItem(doc: Y.Doc, cardId: string, itemId: string, now: number): void {
  withChecklistItem(doc, cardId, itemId, (item) => item.set("done", !getBool(item, "done")), now);
}

export function setChecklistItemText(
  doc: Y.Doc,
  cardId: string,
  itemId: string,
  text: string,
  now: number,
): void {
  withChecklistItem(doc, cardId, itemId, (item) => item.set("text", text), now);
}

export function deleteChecklistItem(doc: Y.Doc, cardId: string, itemId: string, now: number): void {
  withCard(doc, cardId, (card) => checklistOf(card)?.delete(itemId), now);
}

export function moveChecklistItem(
  doc: Y.Doc,
  cardId: string,
  itemId: string,
  neighbors: Neighbors,
  clientId: string,
  now: number,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const cl = checklistOf(card);
      const item = cl?.get(itemId);
      if (!cl || !(item instanceof Y.Map)) return;
      const ordOf = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const other = cl.get(id);
        return other instanceof Y.Map ? getString(other, "ord") : null;
      };
      item.set("ord", keyBetween(ordOf(neighbors.afterId), ordOf(neighbors.beforeId), clientId));
    },
    now,
  );
}

export interface AddLinkParams {
  cardId: string;
  id?: string;
  url: string;
  provider?: LinkProvider;
  title?: string;
  now: number;
  clientId: string;
}

/**
 * Attach a link to a card. Provider is auto-detected from the URL if omitted.
 * De-duplicated by normalized URL — adding an existing link returns its id.
 */
export function addLink(doc: Y.Doc, params: AddLinkParams): string {
  let id = params.id ?? newId();
  doc.transact(() => {
    const card = boardCards(doc).get(params.cardId);
    if (!(card instanceof Y.Map)) return;
    const links = card.get("links");
    if (!(links instanceof Y.Map)) return;
    const target = normalizeUrl(params.url);
    for (const [existingId, existing] of links.entries()) {
      if (existing instanceof Y.Map && normalizeUrl(getString(existing, "url")) === target) {
        id = existingId;
        return;
      }
    }
    const lastOrd = maxOrd(
      [...links.values()]
        .filter((l): l is Y.Map<unknown> => l instanceof Y.Map)
        .map((l) => getString(l, "ord")),
    );
    const link = new Y.Map<unknown>();
    link.set("id", id);
    link.set("url", params.url);
    link.set("provider", params.provider ?? detectProvider(params.url));
    if (params.title !== undefined) link.set("title", params.title);
    link.set("ord", keyBetween(lastOrd, null, params.clientId));
    links.set(id, link);
    card.set("updatedAt", params.now);
    boardMeta(doc).set("updatedAt", params.now);
  });
  return id;
}

export function removeLink(doc: Y.Doc, cardId: string, linkId: string, now: number): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const links = card.get("links");
      if (links instanceof Y.Map) links.delete(linkId);
    },
    now,
  );
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

// ----- labels -----

export interface AddLabelParams {
  id?: string;
  name: string;
  color: string;
  now: number;
  clientId: string;
}

export function addLabel(doc: Y.Doc, params: AddLabelParams): string {
  const id = params.id ?? newId();
  doc.transact(() => {
    const labels = boardLabels(doc);
    const lastOrd = maxOrd([...labels.values()].map((l) => getString(l, "ord")));
    const label = new Y.Map<unknown>();
    label.set("id", id);
    label.set("name", params.name);
    label.set("color", params.color);
    label.set("ord", keyBetween(lastOrd, null, params.clientId));
    labels.set(id, label);
    boardMeta(doc).set("updatedAt", params.now);
  });
  return id;
}

function withLabel(
  doc: Y.Doc,
  labelId: string,
  mutate: (l: Y.Map<unknown>) => void,
  now: number,
): void {
  doc.transact(() => {
    const label = boardLabels(doc).get(labelId);
    if (!(label instanceof Y.Map)) return;
    mutate(label);
    boardMeta(doc).set("updatedAt", now);
  });
}

export function renameLabel(doc: Y.Doc, labelId: string, name: string, now: number): void {
  withLabel(doc, labelId, (l) => l.set("name", name), now);
}

export function recolorLabel(doc: Y.Doc, labelId: string, color: string, now: number): void {
  withLabel(doc, labelId, (l) => l.set("color", color), now);
}

/** Delete a label from the board palette AND strip it from every card's set. */
export function deleteLabel(doc: Y.Doc, labelId: string, now: number): void {
  doc.transact(() => {
    boardLabels(doc).delete(labelId);
    for (const card of boardCards(doc).values()) {
      const set = card.get("labels");
      if (set instanceof Y.Map && set.has(labelId)) set.delete(labelId);
    }
    boardMeta(doc).set("updatedAt", now);
  });
}

export function assignLabel(doc: Y.Doc, cardId: string, labelId: string, now: number): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const set = card.get("labels");
      if (set instanceof Y.Map) set.set(labelId, true);
    },
    now,
  );
}

export function unassignLabel(doc: Y.Doc, cardId: string, labelId: string, now: number): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const set = card.get("labels");
      if (set instanceof Y.Map) set.delete(labelId);
    },
    now,
  );
}

export function listLabels(doc: Y.Doc): Label[] {
  return [...boardLabels(doc).values()]
    .filter((l): l is Y.Map<unknown> => l instanceof Y.Map)
    .map(labelToPlain)
    .sort(byOrd);
}

// ----- selectors (read-only) -----

/**
 * Compute short-id overrides for the whole board (repair-on-read). Duplicate
 * short ids from concurrent offline creation are reassigned deterministically;
 * the map is `cardId → repaired shortId` for cards that changed.
 */
function shortIdOverrides(doc: Y.Doc): Map<string, string> {
  return repairShortIds(
    [...boardCards(doc).values()]
      .filter((c): c is YCard => c instanceof Y.Map)
      .map((c) => ({
        id: getString(c, "id"),
        shortId: getString(c, "shortId"),
        createdAt: getNumber(c, "createdAt"),
      })),
  );
}

function withRepairedShortId(card: Card, overrides: Map<string, string>): Card {
  const repaired = overrides.get(card.id);
  return repaired ? { ...card, shortId: repaired } : card;
}

export function liveColumns(doc: Y.Doc): Column[] {
  return [...boardColumns(doc).values()]
    .filter((c) => !getBool(c, "archived"))
    .map(columnToPlain)
    .sort(byOrd);
}

export function cardsInColumn(doc: Y.Doc, columnId: string): Card[] {
  const overrides = shortIdOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c) => getString(c, "columnId") === columnId && !getBool(c, "archived"))
    .map((c) => withRepairedShortId(cardToPlain(c), overrides))
    .sort(byOrd);
}

/** Non-archived cards whose `columnId` points at no live column ("Unsorted"). */
export function reclaimCards(doc: Y.Doc): Card[] {
  const live = new Set(liveColumns(doc).map((c) => c.id));
  const overrides = shortIdOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c) => !getBool(c, "archived") && !live.has(getString(c, "columnId")))
    .map((c) => withRepairedShortId(cardToPlain(c), overrides))
    .sort(byOrd);
}

export function getCard(doc: Y.Doc, cardId: string): Card | null {
  const c = boardCards(doc).get(cardId);
  return c instanceof Y.Map ? withRepairedShortId(cardToPlain(c), shortIdOverrides(doc)) : null;
}

/** Every non-archived card on the board (any column, incl. unsorted), short-id repaired. */
export function allLiveCards(doc: Y.Doc): Card[] {
  const overrides = shortIdOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c) => c instanceof Y.Map && !getBool(c, "archived"))
    .map((c) => withRepairedShortId(cardToPlain(c), overrides));
}
