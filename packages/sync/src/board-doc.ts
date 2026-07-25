// Typed accessors for a board Y.Doc. Every mutation is a single Yjs
// transaction touching typed keys (never an opaque bag, never an array-of-ids
// rewrite). Since Unit 7 a card's placement IS its `status`: a move is a
// `status` + `ord` write (no `columnId`, no `Column` entity). Soft-delete sets
// `archived` + `deletedAt`. `now` is injected so the logic stays pure/testable.
import {
  type ActivityEntry,
  type Board,
  type BoardSnapshot,
  type Card,
  type DueDate,
  type Label,
  type LinkProvider,
  type PriorityValue,
  type Project,
  type SavedView,
  type SnapshotCard,
  type Status,
  DEFAULT_BADGE_CONFIG,
  DEFAULT_STATUS,
  Priority,
  clampZoom,
  SNAPSHOT_VERSION,
  byOrd,
  compareOrd,
  detectProvider,
  keyBetween,
  newId,
  normalizeUrl,
  repairTicketNumbers,
} from "@boardly/domain";
import * as Y from "yjs";

import {
  type YCard,
  boardActivity,
  boardCards,
  boardLabels,
  boardMeta,
  boardProjects,
  boardToPlain,
  cardToPlain,
  getBool,
  getString,
  getNumber,
  labelToPlain,
  projectToPlain,
} from "./schema";

// ----- internal helpers -----

function maxOrd(ords: string[]): string | null {
  let max: string | null = null;
  for (const ord of ords) {
    if (max === null || compareOrd(ord, max) > 0) max = ord;
  }
  return max;
}

function minOrd(ords: string[]): string | null {
  let min: string | null = null;
  for (const ord of ords) {
    if (min === null || compareOrd(ord, min) < 0) min = ord;
  }
  return min;
}

function rawLiveCardsInStatus(doc: Y.Doc, status: Status): YCard[] {
  return [...boardCards(doc).values()].filter(
    (c) => getStatus(c) === status && !getBool(c, "archived"),
  );
}

function getStatus(c: YCard): Status {
  return getString(c, "status", DEFAULT_STATUS) as Status;
}

function ordOfCard(doc: Y.Doc, cardId: string): string | null {
  const c = boardCards(doc).get(cardId);
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
    meta.set("shortIdPrefix", params.shortIdPrefix ?? "");
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

/** Read the per-user board's plain shape; `userId` becomes `Board.id`. */
export function getBoard(doc: Y.Doc, userId: string): Board {
  return boardToPlain(doc, userId);
}

/** Set the ordered card-face badge row config. */
export function setBadgeConfig(doc: Y.Doc, config: string[], now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("badgeConfig", [...config]);
    meta.set("updatedAt", now);
  });
}

/** Set the board's display-only ticket prefix (already normalized by the caller). */
export function setTicketPrefix(doc: Y.Doc, prefix: string, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("shortIdPrefix", prefix);
    meta.set("updatedAt", now);
  });
}

/**
 * Toggle whether empty status columns are shown on the board (board meta,
 * synced per-user). Defaults to `true` when never set (see `boardToPlain`).
 */
export function setShowEmptyColumns(doc: Y.Doc, show: boolean, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("showEmptyColumns", show);
    meta.set("updatedAt", now);
  });
}

/**
 * Set the whole-app zoom factor (UNIT-15; board meta, synced per-user). The
 * value is clamped to `[ZOOM_MIN, ZOOM_MAX]` at write time so nothing invalid is
 * ever persisted (the read path in `boardToPlain` clamps again defensively).
 */
export function setZoom(doc: Y.Doc, factor: number, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set("zoom", clampZoom(factor));
    meta.set("updatedAt", now);
  });
}

// ----- saved views (Unit 4.1) -----

/** The board's saved views (stored as a plain JSON array on `meta.views`). */
export function listViews(doc: Y.Doc): SavedView[] {
  const raw = boardMeta(doc).get("views");
  return Array.isArray(raw) ? (raw as SavedView[]) : [];
}

/** Insert or replace a saved view by id. */
export function saveView(doc: Y.Doc, view: SavedView, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    const views = listViews(doc).filter((v) => v.id !== view.id);
    views.push(view);
    meta.set("views", views);
    meta.set("updatedAt", now);
  });
}

/** Remove a saved view by id. */
export function deleteView(doc: Y.Doc, viewId: string, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    meta.set(
      "views",
      listViews(doc).filter((v) => v.id !== viewId),
    );
    meta.set("updatedAt", now);
  });
}

// ----- cards -----

export interface AddCardParams {
  id?: string;
  /** Placement status; defaults to Todo. A card's column IS its status. */
  status?: Status;
  title: string;
  projectId?: string;
  /** Initial priority; defaults to None. An Urgent card is slotted at the top. */
  priority?: PriorityValue;
  /** Initial label ids (e.g. seeded from the active filter, Unit 9.5). */
  labelIds?: string[];
  now: number;
  clientId: string;
  createdBy?: string;
}

export function addCard(doc: Y.Doc, params: AddCardParams): string {
  const id = params.id ?? newId();
  const status = params.status ?? DEFAULT_STATUS;
  const priority = params.priority ?? Priority.None;
  doc.transact(() => {
    const meta = boardMeta(doc);
    const cards = boardCards(doc);
    const seq = getNumber(meta, "shortIdSeq") + 1;
    meta.set("shortIdSeq", seq);
    // Urgent cards land at the top of their column; everything else appends.
    const ords = rawLiveCardsInStatus(doc, status).map((c) => getString(c, "ord"));
    const ord =
      priority === Priority.Urgent
        ? keyBetween(null, minOrd(ords), params.clientId)
        : keyBetween(maxOrd(ords), null, params.clientId);
    const card = new Y.Map<unknown>();
    card.set("id", id);
    card.set("number", seq);
    card.set("title", params.title);
    if (params.projectId !== undefined) card.set("projectId", params.projectId);
    card.set("description", new Y.Text());
    card.set("ord", ord);
    card.set("status", status);
    card.set("priority", priority);
    card.set("dueDate", null);
    const labels = new Y.Map<unknown>();
    for (const labelId of params.labelIds ?? []) labels.set(labelId, true);
    card.set("labels", labels);
    card.set("related", new Y.Map<unknown>());
    card.set("checklist", new Y.Map<unknown>());
    card.set("links", new Y.Map<unknown>());
    card.set("archived", false);
    card.set("createdAt", params.now);
    card.set("updatedAt", params.now);
    if (params.createdBy !== undefined) card.set("createdBy", params.createdBy);
    cards.set(id, card);
    meta.set("updatedAt", params.now);
    appendActivity(doc, {
      type: "created",
      cardId: id,
      at: params.now,
      actor: params.createdBy ?? params.clientId,
    });
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

export function setCardTitle(
  doc: Y.Doc,
  cardId: string,
  title: string,
  now: number,
  actor?: string,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      if (getString(card, "title") === title) return;
      card.set("title", title);
      appendActivity(doc, { type: "renamed", cardId, to: title, at: now, actor });
    },
    now,
  );
}

export function setCardPriority(
  doc: Y.Doc,
  cardId: string,
  priority: PriorityValue,
  now: number,
  clientId: string,
  actor?: string,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const from = (card.get("priority") as PriorityValue | undefined) ?? Priority.None;
      if (from === priority) return;
      card.set("priority", priority);
      // Becoming Urgent floats the card to the top of its column, once (the card
      // stays freely draggable afterwards). Other transitions never reorder.
      if (from !== Priority.Urgent && priority === Priority.Urgent) {
        const others = rawLiveCardsInStatus(doc, getStatus(card))
          .filter((c) => getString(c, "id") !== cardId)
          .map((c) => getString(c, "ord"));
        card.set("ord", keyBetween(null, minOrd(others), clientId));
      }
      appendActivity(doc, { type: "priority", cardId, from, to: priority, at: now, actor });
    },
    now,
  );
}

/**
 * Set the workflow status (LWW key) without reordering — the card keeps its
 * `ord` and simply moves to the matching status column. Used by the drawer
 * status picker; `moveCard` is the drag path that also positions the card. When
 * the value actually changes, append a status-change entry to the activity log.
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

/** `Omit` distributed across the ActivityEntry union (preserves per-kind fields). */
type NewActivityEntry = ActivityEntry extends infer T
  ? T extends ActivityEntry
    ? Omit<T, "id">
    : never
  : never;

/**
 * Append an activity entry (append-only Y.Array of plain-ish Y.Maps). Must run
 * inside an existing transaction (every caller already wraps in `doc.transact`).
 */
export function appendActivity(doc: Y.Doc, entry: NewActivityEntry): void {
  const row = new Y.Map<unknown>();
  row.set("id", newId());
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined) row.set(key, value);
  }
  boardActivity(doc).push([row]);
}

/** Reconstruct a typed activity entry from its stored Y.Map (null if unknown). */
function rowToActivity(row: Y.Map<unknown>): ActivityEntry | null {
  const type = getString(row, "type") as ActivityEntry["type"];
  const base = {
    id: getString(row, "id"),
    cardId: getString(row, "cardId"),
    at: getNumber(row, "at"),
  };
  const actorRaw = row.get("actor");
  const actor = typeof actorRaw === "string" ? actorRaw : undefined;
  const withActor = <T extends ActivityEntry>(e: T): T => (actor ? { ...e, actor } : e);
  switch (type) {
    case "created":
      return withActor({ ...base, type: "created" });
    case "archived":
      return withActor({ ...base, type: "archived" });
    case "unarchived":
      return withActor({ ...base, type: "unarchived" });
    case "moved":
      return withActor({
        ...base,
        type: "moved",
        from: (row.get("from") as string | undefined) ?? null,
        to: getString(row, "to"),
      });
    case "renamed":
      return withActor({ ...base, type: "renamed", to: getString(row, "to") });
    case "status":
      return withActor({
        ...base,
        type: "status",
        from: (row.get("from") as Status | undefined) ?? null,
        to: getString(row, "to", DEFAULT_STATUS) as Status,
      });
    case "priority":
      return withActor({
        ...base,
        type: "priority",
        from: (row.get("from") as PriorityValue | undefined) ?? Priority.None,
        to: (row.get("to") as PriorityValue | undefined) ?? Priority.None,
      });
    case "due":
      return withActor({
        ...base,
        type: "due",
        to: (row.get("to") as number | undefined) ?? null,
      });
    default:
      return null;
  }
}

/** Read the whole board activity log, oldest → newest. */
export function listActivity(doc: Y.Doc): ActivityEntry[] {
  return boardActivity(doc)
    .toArray()
    .filter((row): row is Y.Map<unknown> => row instanceof Y.Map)
    .map(rowToActivity)
    .filter((e): e is ActivityEntry => e !== null);
}

/** A single card's activity, newest → oldest (for the detail-panel timeline). */
export function cardActivity(doc: Y.Doc, cardId: string): ActivityEntry[] {
  return listActivity(doc)
    .filter((e) => e.cardId === cardId)
    .reverse();
}

/** Set or clear the due date (stored as a nested Y.Map, never a JSON string). */
export function setCardDueDate(
  doc: Y.Doc,
  cardId: string,
  due: DueDate | null,
  now: number,
  actor?: string,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const prev = card.get("dueDate");
      const prevAt =
        prev instanceof Y.Map ? ((prev.get("at") as number | undefined) ?? null) : null;
      if (due === null) {
        if (prevAt === null) return; // already clear
        card.set("dueDate", null);
        appendActivity(doc, { type: "due", cardId, to: null, at: now, actor });
        return;
      }
      const map = new Y.Map<unknown>();
      map.set("at", due.at);
      map.set("hasTime", due.hasTime);
      card.set("dueDate", map);
      if (prevAt !== due.at) {
        appendActivity(doc, { type: "due", cardId, to: due.at, at: now, actor });
      }
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

/** Reorder a link between neighbors on a card (fractional `ord`, same as cards/checklist). */
export function moveLink(
  doc: Y.Doc,
  cardId: string,
  linkId: string,
  neighbors: Neighbors,
  clientId: string,
  now: number,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const links = card.get("links");
      const link = links instanceof Y.Map ? links.get(linkId) : undefined;
      if (!(links instanceof Y.Map) || !(link instanceof Y.Map)) return;
      const ordOf = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const other = links.get(id);
        return other instanceof Y.Map ? getString(other, "ord") : null;
      };
      link.set("ord", keyBetween(ordOf(neighbors.afterId), ordOf(neighbors.beforeId), clientId));
    },
    now,
  );
}

/**
 * Set a link's display title — used to enrich a generic link after an async
 * unfurl resolves (the link is persisted immediately with no title). A no-op if
 * the card or link was removed meanwhile, so a late-arriving title can't
 * resurrect a deleted link.
 */
export function setLinkTitle(
  doc: Y.Doc,
  cardId: string,
  linkId: string,
  title: string,
  now: number,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      const links = card.get("links");
      const link = links instanceof Y.Map ? links.get(linkId) : undefined;
      if (link instanceof Y.Map) link.set("title", title);
    },
    now,
  );
}

/**
 * Move a card to `toStatus` at the slot between the neighbors. A single
 * `status` + `ord` write — concurrent moves of the same card resolve by Yjs LWW
 * to exactly one status (no duplicate). Because a card's column IS its status,
 * a move to a different status is a status change and logs a `status` activity
 * entry; moving within the same status only reorders (`ord` changes) and logs
 * nothing.
 */
export function moveCard(
  doc: Y.Doc,
  cardId: string,
  toStatus: Status,
  neighbors: Neighbors,
  clientId: string,
  now: number,
  actor?: string,
): void {
  doc.transact(() => {
    const card = boardCards(doc).get(cardId);
    if (!(card instanceof Y.Map)) return;
    const from = getStatus(card);
    const afterOrd = neighbors.afterId ? ordOfCard(doc, neighbors.afterId) : null;
    const beforeOrd = neighbors.beforeId ? ordOfCard(doc, neighbors.beforeId) : null;
    card.set("status", toStatus);
    card.set("ord", keyBetween(afterOrd, beforeOrd, clientId));
    card.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
    // A status change is worth logging; pure reordering within a status is not.
    if (from !== toStatus) {
      appendActivity(doc, {
        type: "status",
        cardId,
        from,
        to: toStatus,
        at: now,
        actor: actor ?? clientId,
      });
    }
  });
}

// ----- relations (untyped, symmetric — Unit 9.1) -----

/** Get (or lazily create) a card's `related` set map. */
function relatedOf(card: YCard): Y.Map<unknown> {
  const set = card.get("related");
  if (set instanceof Y.Map) return set;
  const created = new Y.Map<unknown>();
  card.set("related", created);
  return created;
}

/**
 * Symmetrically relate two cards (untyped). Writes both directions in one
 * transaction so either card's drawer shows the link with no read-time join.
 * No-op for a self-relation or a missing card.
 */
export function addRelation(doc: Y.Doc, aId: string, bId: string, now: number): void {
  if (aId === bId) return;
  doc.transact(() => {
    const a = boardCards(doc).get(aId);
    const b = boardCards(doc).get(bId);
    if (!(a instanceof Y.Map) || !(b instanceof Y.Map)) return;
    relatedOf(a).set(bId, true);
    relatedOf(b).set(aId, true);
    a.set("updatedAt", now);
    b.set("updatedAt", now);
    boardMeta(doc).set("updatedAt", now);
  });
}

/** Symmetrically remove a relation between two cards (both directions). */
export function removeRelation(doc: Y.Doc, aId: string, bId: string, now: number): void {
  doc.transact(() => {
    for (const [self, other] of [
      [aId, bId],
      [bId, aId],
    ] as const) {
      const card = boardCards(doc).get(self);
      if (!(card instanceof Y.Map)) continue;
      const set = card.get("related");
      if (set instanceof Y.Map) set.delete(other);
      card.set("updatedAt", now);
    }
    boardMeta(doc).set("updatedAt", now);
  });
}

/** Soft-delete a card: removed from selectors, kept in the map (for undo/sync). */
export function archiveCard(doc: Y.Doc, cardId: string, now: number, actor?: string): void {
  withCard(
    doc,
    cardId,
    (card) => {
      if (getBool(card, "archived")) return;
      card.set("archived", true);
      card.set("deletedAt", now);
      appendActivity(doc, { type: "archived", cardId, at: now, actor });
    },
    now,
  );
}

/**
 * Restore an archived card (inverse of {@link archiveCard}): clears `archived`
 * and drops `deletedAt` so the card reappears in every selector in the status
 * column it still holds (archiving never touched `status`). No-op if the card is
 * not archived. Logs an `unarchived` activity entry.
 */
export function unarchiveCard(doc: Y.Doc, cardId: string, now: number, actor?: string): void {
  withCard(
    doc,
    cardId,
    (card) => {
      if (!getBool(card, "archived")) return;
      card.set("archived", false);
      card.delete("deletedAt");
      appendActivity(doc, { type: "unarchived", cardId, at: now, actor });
    },
    now,
  );
}

/**
 * Hard-delete a card: remove it from the doc entirely (unlike {@link archiveCard},
 * which keeps it for a future archive view). First strips the id from every
 * other card's `related` set so no dangling relation survives (mirrors
 * {@link deleteLabel}'s cross-card cleanup), then deletes the card's own map key.
 */
export function deleteCard(doc: Y.Doc, cardId: string, now: number): void {
  doc.transact(() => {
    const cards = boardCards(doc);
    if (!cards.has(cardId)) return;
    for (const card of cards.values()) {
      const set = card.get("related");
      if (set instanceof Y.Map && set.has(cardId)) set.delete(cardId);
    }
    cards.delete(cardId);
    boardMeta(doc).set("updatedAt", now);
  });
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

// ----- projects (grouping under the single board; a card has one) -----

export interface AddProjectParams {
  id?: string;
  name: string;
  color: string;
  now: number;
  clientId: string;
}

export function addProject(doc: Y.Doc, params: AddProjectParams): string {
  const id = params.id ?? newId();
  doc.transact(() => {
    const projects = boardProjects(doc);
    const lastOrd = maxOrd(
      [...projects.values()]
        .filter((p): p is Y.Map<unknown> => p instanceof Y.Map && !getBool(p, "archived"))
        .map((p) => getString(p, "ord")),
    );
    const project = new Y.Map<unknown>();
    project.set("id", id);
    project.set("name", params.name);
    project.set("color", params.color);
    project.set("ord", keyBetween(lastOrd, null, params.clientId));
    project.set("archived", false);
    projects.set(id, project);
    boardMeta(doc).set("updatedAt", params.now);
  });
  return id;
}

function withProject(
  doc: Y.Doc,
  projectId: string,
  mutate: (p: Y.Map<unknown>) => void,
  now: number,
): void {
  doc.transact(() => {
    const project = boardProjects(doc).get(projectId);
    if (!(project instanceof Y.Map)) return;
    mutate(project);
    boardMeta(doc).set("updatedAt", now);
  });
}

export function renameProject(doc: Y.Doc, projectId: string, name: string, now: number): void {
  withProject(doc, projectId, (p) => p.set("name", name), now);
}

export function recolorProject(doc: Y.Doc, projectId: string, color: string, now: number): void {
  withProject(doc, projectId, (p) => p.set("color", color), now);
}

/** Soft-archive a project (hidden from the list). Cards keep their `projectId`. */
export function archiveProject(doc: Y.Doc, projectId: string, now: number): void {
  withProject(
    doc,
    projectId,
    (p) => {
      p.set("archived", true);
      p.set("deletedAt", now);
    },
    now,
  );
}

/** Restore a hidden (archived) project to the active list. Inverse of {@link archiveProject}. */
export function unarchiveProject(doc: Y.Doc, projectId: string, now: number): void {
  withProject(
    doc,
    projectId,
    (p) => {
      p.set("archived", false);
      p.delete("deletedAt");
    },
    now,
  );
}

export function listProjects(doc: Y.Doc): Project[] {
  return [...boardProjects(doc).values()]
    .filter((p): p is Y.Map<unknown> => p instanceof Y.Map && !getBool(p, "archived"))
    .map(projectToPlain)
    .sort(byOrd);
}

/** Archived (hidden) projects — for the "Hidden" restore list in Settings. */
export function listArchivedProjects(doc: Y.Doc): Project[] {
  return [...boardProjects(doc).values()]
    .filter((p): p is Y.Map<unknown> => p instanceof Y.Map && getBool(p, "archived"))
    .map(projectToPlain)
    .sort(byOrd);
}

/** Set (or clear, with `null`) a card's project. */
export function setCardProject(
  doc: Y.Doc,
  cardId: string,
  projectId: string | null,
  now: number,
): void {
  withCard(
    doc,
    cardId,
    (card) => {
      if (projectId === null) card.delete("projectId");
      else card.set("projectId", projectId);
    },
    now,
  );
}

// ----- selectors (read-only) -----

/** The board's display-only ticket prefix (empty by default). */
function boardPrefix(doc: Y.Doc): string {
  return getString(boardMeta(doc), "shortIdPrefix", "");
}

/**
 * Compute ticket-number overrides for the whole board (repair-on-read).
 * Duplicate numbers from concurrent offline creation are reassigned
 * deterministically; the map is `cardId → repaired number` for cards that
 * changed. Pass an entry's override to `cardToPlain` to derive its `shortId`.
 */
function ticketNumberOverrides(doc: Y.Doc): Map<string, number> {
  return repairTicketNumbers(
    [...boardCards(doc).values()]
      .filter((c): c is YCard => c instanceof Y.Map)
      .map((c) => ({
        id: getString(c, "id"),
        number: getNumber(c, "number"),
        createdAt: getNumber(c, "createdAt"),
      })),
  );
}

/** Convert a stored card, deriving `shortId` from the board prefix + repaired number. */
function toPlain(c: YCard, prefix: string, overrides: Map<string, number>): Card {
  return cardToPlain(c, { prefix, number: overrides.get(getString(c, "id")) });
}

/** Non-archived cards with the given `status` (i.e. in that fixed column), sorted by `ord`. */
export function cardsInStatus(doc: Y.Doc, status: Status): Card[] {
  const prefix = boardPrefix(doc);
  const overrides = ticketNumberOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c) => getStatus(c) === status && !getBool(c, "archived"))
    .map((c) => toPlain(c, prefix, overrides))
    .sort(byOrd);
}

export function getCard(doc: Y.Doc, cardId: string): Card | null {
  const c = boardCards(doc).get(cardId);
  return c instanceof Y.Map ? toPlain(c, boardPrefix(doc), ticketNumberOverrides(doc)) : null;
}

/** Every non-archived card on the board (any status), number-repaired. */
export function allLiveCards(doc: Y.Doc): Card[] {
  const prefix = boardPrefix(doc);
  const overrides = ticketNumberOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c) => c instanceof Y.Map && !getBool(c, "archived"))
    .map((c) => toPlain(c, prefix, overrides));
}

/**
 * Every archived card, most-recently-archived first (by `deletedAt` desc) —
 * the data behind the Archive view. Complement of {@link allLiveCards}.
 */
export function listArchivedCards(doc: Y.Doc): Card[] {
  const prefix = boardPrefix(doc);
  const overrides = ticketNumberOverrides(doc);
  return [...boardCards(doc).values()]
    .filter((c): c is YCard => c instanceof Y.Map && getBool(c, "archived"))
    .map((c) => toPlain(c, prefix, overrides))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

// ----- import / export (Unit 4.4) -----

/**
 * Read a full-fidelity snapshot of a board (cards + labels + meta) for export.
 * Card placement is its `status`; there is no columns array. Archived items are
 * excluded — a clean export.
 */
export function boardToSnapshot(doc: Y.Doc, userId: string): BoardSnapshot {
  const board = boardToPlain(doc, userId);
  return {
    version: SNAPSHOT_VERSION,
    board: {
      title: board.title,
      ...(board.icon !== undefined ? { icon: board.icon } : {}),
      ...(board.description !== undefined ? { description: board.description } : {}),
      shortIdPrefix: board.shortIdPrefix,
      badgeConfig: board.badgeConfig,
    },
    labels: listLabels(doc),
    cards: allLiveCards(doc).map((c) => ({ ...c })),
  };
}

function buildCard(card: SnapshotCard): YCard {
  const yc = new Y.Map<unknown>();
  yc.set("id", card.id);
  yc.set("number", card.number);
  yc.set("title", card.title);
  const desc = new Y.Text();
  if (card.description) desc.insert(0, card.description);
  yc.set("description", desc);
  yc.set("ord", card.ord);
  yc.set("status", card.status);
  yc.set("priority", card.priority);
  if (card.dueDate) {
    const due = new Y.Map<unknown>();
    due.set("at", card.dueDate.at);
    due.set("hasTime", card.dueDate.hasTime);
    yc.set("dueDate", due);
  } else {
    yc.set("dueDate", null);
  }
  const labels = new Y.Map<unknown>();
  for (const id of card.labelIds) labels.set(id, true);
  yc.set("labels", labels);
  const related = new Y.Map<unknown>();
  for (const id of card.relatedIds ?? []) related.set(id, true);
  yc.set("related", related);
  const checklist = new Y.Map<unknown>();
  for (const item of card.checklist) {
    const yi = new Y.Map<unknown>();
    yi.set("text", item.text);
    yi.set("done", item.done);
    yi.set("ord", item.ord);
    checklist.set(item.id, yi);
  }
  yc.set("checklist", checklist);
  const links = new Y.Map<unknown>();
  for (const link of card.links) {
    const yl = new Y.Map<unknown>();
    yl.set("url", link.url);
    yl.set("provider", link.provider);
    if (link.title !== undefined) yl.set("title", link.title);
    if (link.iconRef !== undefined) yl.set("iconRef", link.iconRef);
    yl.set("ord", link.ord);
    links.set(link.id, yl);
  }
  yc.set("links", links);
  yc.set("archived", false);
  yc.set("createdAt", card.createdAt);
  yc.set("updatedAt", card.updatedAt);
  if (card.assigneeId !== undefined) yc.set("assigneeId", card.assigneeId);
  if (card.createdBy !== undefined) yc.set("createdBy", card.createdBy);
  return yc;
}

/** Highest ticket number across the cards (seeds the board's `shortIdSeq`). */
function maxTicketNumber(cards: SnapshotCard[]): number {
  let max = 0;
  for (const c of cards) max = Math.max(max, c.number);
  return max;
}

/**
 * Populate a fresh board Y.Doc from a snapshot (import). Writes ids/ords/fields
 * verbatim so a JSON export round-trips exactly. `now` stamps board meta and any
 * card lacking a timestamp (e.g. an Obsidian import). Idempotent-guarded: does
 * nothing if the doc is already initialized.
 */
export function buildBoardFromSnapshot(doc: Y.Doc, snapshot: BoardSnapshot, now: number): void {
  doc.transact(() => {
    const meta = boardMeta(doc);
    if (meta.has("createdAt")) return;
    meta.set("title", snapshot.board.title);
    if (snapshot.board.icon !== undefined) meta.set("icon", snapshot.board.icon);
    const desc = new Y.Text();
    if (snapshot.board.description) desc.insert(0, snapshot.board.description);
    meta.set("description", desc);
    meta.set("shortIdPrefix", snapshot.board.shortIdPrefix);
    meta.set("shortIdSeq", maxTicketNumber(snapshot.cards));
    meta.set(
      "badgeConfig",
      snapshot.board.badgeConfig.length
        ? [...snapshot.board.badgeConfig]
        : [...DEFAULT_BADGE_CONFIG],
    );
    meta.set("createdAt", now);
    meta.set("updatedAt", now);

    const labels = boardLabels(doc);
    for (const label of snapshot.labels) {
      const yl = new Y.Map<unknown>();
      yl.set("id", label.id);
      yl.set("name", label.name);
      yl.set("color", label.color);
      yl.set("ord", label.ord);
      labels.set(label.id, yl);
    }

    const cards = boardCards(doc);
    for (const card of snapshot.cards) {
      cards.set(
        card.id,
        buildCard({ ...card, createdAt: card.createdAt || now, updatedAt: card.updatedAt || now }),
      );
    }
  });
}
