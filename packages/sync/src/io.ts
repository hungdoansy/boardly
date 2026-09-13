// The snapshot **write** path: turning a parsed `BoardSnapshot` into board-doc
// content. Moved out of `board-doc.ts` in UNIT-21 (U4) because it stopped being
// one function — it is now three apply modes over a staged document, and it is
// the only place in the repo that hard-deletes board content.
//
// The read side (`boardToSnapshot`) stays in `board-doc.ts`: it is a selector
// like every other selector there, and keeping the two apart is what stops this
// module from needing anything back out of `board-doc.ts` (no import cycle —
// `board-doc.ts` re-exports `buildBoardFromSnapshot` from here, one way).
//
// Modes (R4)
// ----------
//   replace — hard-clear cards, projects and labels, then write the file
//             verbatim, including its saved views. The device's display
//             preferences (`zoom`, `showEmptyColumns`) are left alone: they are
//             device state, not board content (R6).
//   merge   — union by resolved id, never delete. Entities the file does not
//             mention are untouched; a card the board edited more recently is
//             skipped (R12); an existing card's `archived` flag is never
//             flipped (R11).
//   copy    — every entity arrives under a fresh id, so nothing in the file can
//             collide with anything on the board (R8).
//
// Atomicity (KTD8, R18, R25)
// --------------------------
// `doc.transact` is `try`/`finally` with **no `catch`** — a throw part-way
// through leaves every write before it committed *and* propagated. So the whole
// apply runs against a detached `Y.Doc` cloned from the live one, and only a
// clean completion encodes the difference and applies it to the live doc in one
// transaction. A throw discards the staging doc and the board never moves. See
// `docs/solutions/architecture-patterns/yjs-transact-has-no-rollback.md`.
import {
  type BoardSnapshot,
  type DroppedRef,
  type EntityFusion,
  type ResolvableEntity,
  type ResolvedCardRefs,
  type SavedView,
  type SnapshotCard,
  type SnapshotLabel,
  type SnapshotProject,
  type Status,
  DEFAULT_BADGE_CONFIG,
  compareOrd,
  keyBetween,
  newId,
  resolveImport,
} from "@boardly/domain";
import * as Y from "yjs";

import {
  type YCard,
  boardCards,
  boardLabels,
  boardMeta,
  boardProjects,
  getBool,
  getNumber,
  getString,
} from "./schema";

/** The three ways a file can meet a board. Declared as a tuple so the command layer's enum cannot drift from it. */
export const IMPORT_MODES = ["replace", "merge", "copy"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

/** Per-entity-kind outcome counts (R17). */
export interface ImportCounts {
  created: number;
  updated: number;
  /** Present in the file, deliberately not written: already on the board, or stale. */
  skipped: number;
}

/** One card the file would have overwritten with an older version (R12). */
export interface StaleSkip {
  /** The board card's id (in merge, the same id the file used). */
  cardId: string;
  /** The board's title for it — the result names entities, never ids (R17). */
  title: string;
  fileUpdatedAt: number;
  boardUpdatedAt: number;
}

/** What an import actually did. The only feedback a REST/MCP caller ever gets (KTD6). */
export interface ImportResult {
  mode: ImportMode;
  cards: ImportCounts;
  projects: ImportCounts;
  labels: ImportCounts;
  /** Name collapses, each carrying both names and the file-id → board-id pair (R10, R17). */
  fusions: EntityFusion[];
  stale: StaleSkip[];
  /** References that resolved to nothing and were not written (R13). */
  dropped: DroppedRef[];
}

export interface ApplySnapshotOptions {
  mode: ImportMode;
  now: number;
  /**
   * Tie-breaker baked into every generated `ord`. Defaults to `"import"`: an
   * import writes a contiguous run of keys in one shot, so the suffix only has
   * to distinguish it from a *concurrent* writer, which a per-import constant
   * already does.
   */
  clientId?: string;
  /**
   * The importing user. An `assigneeId` that is not this id is dropped as an
   * unresolvable reference (R20). Omit it and assignees pass through untouched.
   */
  userId?: string;
  /** Board title override. Only `replace` writes board meta, so only it uses this. */
  title?: string;
}

// ----- reading the board side (staging doc, before it is written to) -----

function cardMaps(doc: Y.Doc): YCard[] {
  return [...boardCards(doc).values()].filter((c): c is YCard => c instanceof Y.Map);
}

function projectMaps(doc: Y.Doc): Y.Map<unknown>[] {
  return [...boardProjects(doc).values()].filter((p): p is Y.Map<unknown> => p instanceof Y.Map);
}

function labelMaps(doc: Y.Doc): Y.Map<unknown>[] {
  return [...boardLabels(doc).values()].filter((l): l is Y.Map<unknown> => l instanceof Y.Map);
}

/** Board projects as resolution candidates — archived ones included, flagged. */
function projectCandidates(doc: Y.Doc): ResolvableEntity[] {
  return projectMaps(doc).map((p) => ({
    id: getString(p, "id"),
    name: getString(p, "name"),
    ord: getString(p, "ord"),
    archived: getBool(p, "archived"),
  }));
}

/** Board labels as resolution candidates. A label cannot be archived. */
function labelCandidates(doc: Y.Doc): ResolvableEntity[] {
  return labelMaps(doc).map((l) => ({
    id: getString(l, "id"),
    name: getString(l, "name"),
    ord: getString(l, "ord"),
  }));
}

// ----- ord allocation (R14, R23) -----

/**
 * Hands out fractional keys that sort after everything already placed. Seeded
 * with the highest `ord` in the target list, then advanced monotonically, so a
 * run of generated keys keeps its own order and lands after existing content.
 */
class OrdAllocator {
  private last: string | null;

  constructor(
    private readonly clientId: string,
    seed: string | null,
  ) {
    this.last = seed;
  }

  next(): string {
    this.last = keyBetween(this.last, null, this.clientId);
    return this.last;
  }

  /** Fold a verbatim `ord` in, so later generated keys still sort after it. */
  observe(ord: string): void {
    if (ord === "") return;
    if (this.last === null || compareOrd(ord, this.last) > 0) this.last = ord;
  }
}

function maxOrdOf(values: string[]): string | null {
  let max: string | null = null;
  for (const ord of values) {
    if (ord === "") continue;
    if (max === null || compareOrd(ord, max) > 0) max = ord;
  }
  return max;
}

/** One allocator per status, seeded from the cards already in that status. */
function statusAllocators(doc: Y.Doc, clientId: string): Map<Status, OrdAllocator> {
  const byStatus = new Map<Status, string[]>();
  for (const card of cardMaps(doc)) {
    const status = getString(card, "status") as Status;
    const list = byStatus.get(status);
    if (list) list.push(getString(card, "ord"));
    else byStatus.set(status, [getString(card, "ord")]);
  }
  const allocators = new Map<Status, OrdAllocator>();
  for (const [status, ords] of byStatus) {
    allocators.set(status, new OrdAllocator(clientId, maxOrdOf(ords)));
  }
  return allocators;
}

function allocatorFor(
  allocators: Map<Status, OrdAllocator>,
  status: Status,
  clientId: string,
): OrdAllocator {
  const held = allocators.get(status);
  if (held !== undefined) return held;
  const fresh = new OrdAllocator(clientId, null);
  allocators.set(status, fresh);
  return fresh;
}

// ----- ticket numbers (KTD5) -----

/**
 * Hands out ticket numbers. An incoming number is kept verbatim when it is
 * positive and free; otherwise a fresh one is allocated past the highest in
 * use. Repair-on-read (`repairTicketNumbers`) would otherwise resolve a
 * collision in favour of the *earliest* `(createdAt, id)` card — which can be
 * the incoming one, renumbering a ticket the user already refers to.
 */
class TicketNumbers {
  private readonly used = new Set<number>();
  private seq: number;

  constructor(seq: number, existing: number[]) {
    this.seq = seq;
    for (const number of existing) {
      this.used.add(number);
      if (number > this.seq) this.seq = number;
    }
  }

  take(incoming: number): number {
    if (incoming > 0 && !this.used.has(incoming)) {
      this.used.add(incoming);
      if (incoming > this.seq) this.seq = incoming;
      return incoming;
    }
    do {
      this.seq += 1;
    } while (this.used.has(this.seq));
    this.used.add(this.seq);
    return this.seq;
  }

  /** The value `shortIdSeq` must reach so the next card created does not collide. */
  get high(): number {
    return this.seq;
  }
}

// ----- writers -----

function setText(holder: Y.Map<unknown>, key: string, text: string): void {
  const current = holder.get(key);
  if (current instanceof Y.Text) {
    if (current.toString() === text) return;
    current.delete(0, current.length);
    if (text) current.insert(0, text);
    return;
  }
  const next = new Y.Text();
  if (text) next.insert(0, text);
  holder.set(key, next);
}

/** Write only when the value actually differs — a Y.Map `set` always creates a new item, and R15 wants a re-run to be a true no-op. */
function setIfChanged(holder: Y.Map<unknown>, key: string, value: unknown): boolean {
  if (holder.get(key) === value) return false;
  holder.set(key, value);
  return true;
}

function writeProject(
  target: Y.Map<Y.Map<unknown>>,
  id: string,
  source: SnapshotProject,
  ord: string,
): void {
  const yp = new Y.Map<unknown>();
  yp.set("id", id);
  yp.set("name", source.name);
  yp.set("color", source.color);
  yp.set("ord", ord);
  yp.set("archived", source.archived);
  if (source.archived && source.deletedAt !== undefined) yp.set("deletedAt", source.deletedAt);
  target.set(id, yp);
}

function writeLabel(
  target: Y.Map<Y.Map<unknown>>,
  id: string,
  source: SnapshotLabel,
  ord: string,
): void {
  const yl = new Y.Map<unknown>();
  yl.set("id", id);
  yl.set("name", source.name);
  yl.set("color", source.color);
  yl.set("ord", ord);
  target.set(id, yl);
}

interface CardWrite {
  id: string;
  number: number;
  ord: string;
  source: SnapshotCard;
  refs: ResolvedCardRefs;
}

function buildCard(write: CardWrite, now: number): YCard {
  const { source, refs } = write;
  const yc = new Y.Map<unknown>();
  yc.set("id", write.id);
  yc.set("number", write.number);
  yc.set("title", source.title);
  const desc = new Y.Text();
  if (source.description) desc.insert(0, source.description);
  yc.set("description", desc);
  yc.set("ord", write.ord);
  yc.set("status", source.status);
  yc.set("priority", source.priority);
  if (source.dueDate) {
    const due = new Y.Map<unknown>();
    due.set("at", source.dueDate.at);
    due.set("hasTime", source.dueDate.hasTime);
    yc.set("dueDate", due);
  } else {
    yc.set("dueDate", null);
  }
  if (refs.projectId !== undefined) yc.set("projectId", refs.projectId);
  const labels = new Y.Map<unknown>();
  for (const id of refs.labelIds) labels.set(id, true);
  yc.set("labels", labels);
  // Filled in by the relation pass, which needs every card to exist first.
  yc.set("related", new Y.Map<unknown>());
  const checklist = new Y.Map<unknown>();
  for (const item of source.checklist) {
    const yi = new Y.Map<unknown>();
    yi.set("text", item.text);
    yi.set("done", item.done);
    yi.set("ord", item.ord);
    checklist.set(item.id, yi);
  }
  yc.set("checklist", checklist);
  const links = new Y.Map<unknown>();
  for (const link of source.links) {
    const yl = new Y.Map<unknown>();
    yl.set("url", link.url);
    yl.set("provider", link.provider);
    if (link.title !== undefined) yl.set("title", link.title);
    if (link.iconRef !== undefined) yl.set("iconRef", link.iconRef);
    yl.set("ord", link.ord);
    links.set(link.id, yl);
  }
  yc.set("links", links);
  yc.set("archived", source.archived);
  if (source.archived) yc.set("deletedAt", source.deletedAt ?? now);
  yc.set("createdAt", source.createdAt || now);
  yc.set("updatedAt", source.updatedAt || now);
  if (refs.assigneeId !== undefined) yc.set("assigneeId", refs.assigneeId);
  if (source.createdBy !== undefined) yc.set("createdBy", source.createdBy);
  return yc;
}

/**
 * Fold a file card into the board's existing card (merge). Unions rather than
 * replaces, and leaves alone everything the board owns: `archived` and its
 * `deletedAt` (R11), `number` (KTD5 — a ticket id the user already uses),
 * `createdAt`, and the card's placement unless its status moved.
 */
function updateCard(
  yc: YCard,
  source: SnapshotCard,
  refs: ResolvedCardRefs,
  now: number,
  allocators: Map<Status, OrdAllocator>,
  clientId: string,
): boolean {
  let changed = false;

  changed = setIfChanged(yc, "title", source.title) || changed;

  // An empty incoming description carries no content; it never blanks the board's.
  if (source.description) {
    const current = yc.get("description");
    const before = current instanceof Y.Text ? current.toString() : "";
    if (before !== source.description) {
      setText(yc, "description", source.description);
      changed = true;
    }
  }

  const previousStatus = getString(yc, "status") as Status;
  if (previousStatus !== source.status) {
    yc.set("status", source.status);
    // Placement is per status, so a move needs a key in the column it moved to.
    yc.set("ord", allocatorFor(allocators, source.status, clientId).next());
    changed = true;
  }

  changed = setIfChanged(yc, "priority", source.priority) || changed;

  const currentDue = yc.get("dueDate");
  if (source.dueDate) {
    if (currentDue instanceof Y.Map) {
      changed = setIfChanged(currentDue, "at", source.dueDate.at) || changed;
      changed = setIfChanged(currentDue, "hasTime", source.dueDate.hasTime) || changed;
    } else {
      const due = new Y.Map<unknown>();
      due.set("at", source.dueDate.at);
      due.set("hasTime", source.dueDate.hasTime);
      yc.set("dueDate", due);
      changed = true;
    }
  }

  if (refs.projectId !== undefined) {
    changed = setIfChanged(yc, "projectId", refs.projectId) || changed;
  }
  if (refs.assigneeId !== undefined) {
    changed = setIfChanged(yc, "assigneeId", refs.assigneeId) || changed;
  }
  if (source.createdBy !== undefined && !yc.has("createdBy")) {
    yc.set("createdBy", source.createdBy);
    changed = true;
  }

  // Sets and sub-collections union: a merge never removes what the board has.
  const labels = yc.get("labels");
  if (labels instanceof Y.Map) {
    for (const id of refs.labelIds) {
      if (!labels.has(id)) {
        labels.set(id, true);
        changed = true;
      }
    }
  }

  const checklist = yc.get("checklist");
  if (checklist instanceof Y.Map) {
    for (const item of source.checklist) {
      const existing = checklist.get(item.id);
      if (existing instanceof Y.Map) {
        changed = setIfChanged(existing, "text", item.text) || changed;
        changed = setIfChanged(existing, "done", item.done) || changed;
      } else {
        const yi = new Y.Map<unknown>();
        yi.set("text", item.text);
        yi.set("done", item.done);
        yi.set("ord", item.ord);
        checklist.set(item.id, yi);
        changed = true;
      }
    }
  }

  const links = yc.get("links");
  if (links instanceof Y.Map) {
    for (const link of source.links) {
      const existing = links.get(link.id);
      if (existing instanceof Y.Map) {
        changed = setIfChanged(existing, "url", link.url) || changed;
        if (link.title !== undefined)
          changed = setIfChanged(existing, "title", link.title) || changed;
      } else {
        const yl = new Y.Map<unknown>();
        yl.set("url", link.url);
        yl.set("provider", link.provider);
        if (link.title !== undefined) yl.set("title", link.title);
        if (link.iconRef !== undefined) yl.set("iconRef", link.iconRef);
        yl.set("ord", link.ord);
        links.set(link.id, yl);
        changed = true;
      }
    }
  }

  if (changed) yc.set("updatedAt", source.updatedAt || now);
  return changed;
}

/**
 * Write relations to both sides or not at all, mirroring `linkRelated`'s
 * symmetry. Runs after every card exists, so a relation between two arriving
 * cards can be written in either direction.
 */
function writeRelations(doc: Y.Doc, pairs: readonly (readonly [string, string])[]): void {
  const cards = boardCards(doc);
  for (const [a, b] of pairs) {
    const ca = cards.get(a);
    const cb = cards.get(b);
    if (!(ca instanceof Y.Map) || !(cb instanceof Y.Map)) continue;
    const ra = ca.get("related");
    const rb = cb.get("related");
    if (!(ra instanceof Y.Map) || !(rb instanceof Y.Map)) continue;
    if (!ra.has(b)) ra.set(b, true);
    if (!rb.has(a)) rb.set(a, true);
  }
}

// ----- the apply -----

/** A file card that will be created (rather than folded into an existing one). */
interface PlannedCard {
  /** Its id on the board: the file's own, or a fresh one in `copy` mode. */
  id: string;
  source: SnapshotCard;
  refs: ResolvedCardRefs;
}

/** The board half of a resolution request — the real board, or the file standing in for it. */
type ImportResolutionBoard = NonNullable<Parameters<typeof resolveImport>[0]["board"]>;

const EMPTY_COUNTS = (): ImportCounts => ({ created: 0, updated: 0, skipped: 0 });

/**
 * Run the whole apply against `doc`, which is the detached staging document.
 * Everything that can throw — resolution, ord and number allocation, every
 * write — happens here, where a throw costs nothing.
 */
function stage(doc: Y.Doc, snapshot: BoardSnapshot, opts: ApplySnapshotOptions): ImportResult {
  const { mode, now } = opts;
  const clientId = opts.clientId ?? "import";
  const meta = boardMeta(doc);

  const result: ImportResult = {
    mode,
    cards: EMPTY_COUNTS(),
    projects: EMPTY_COUNTS(),
    labels: EMPTY_COUNTS(),
    fusions: [],
    stale: [],
    dropped: [],
  };

  // Replace hard-deletes before anything is read back, so from here on every
  // mode sees the board it is actually writing into (KTD7).
  if (mode === "replace") {
    boardCards(doc).clear();
    boardProjects(doc).clear();
    boardLabels(doc).clear();
  }

  // Resolution (U3). Merge resolves against the real board. Replace and copy
  // resolve against the *file's own* entities instead: that still detects a
  // dangling reference (an id nothing in the file defines), but every file
  // entity id-matches itself, so nothing fuses. Two projects the board
  // legitimately holds under names that normalize alike must both survive a
  // restore — fusing is a merge rule (R10), not a rebuild rule.
  // `ord` is optional on a snapshot entity (R23) but required on a resolution
  // candidate. It is unused on the file side — only board candidates are
  // ordered — so an absent one stands in as empty.
  const fileProjects = snapshot.projects.map((p) => ({ ...p, ord: p.ord ?? "" }));
  const fileLabels = snapshot.labels.map((l) => ({ ...l, ord: l.ord ?? "" }));
  const boardSide: ImportResolutionBoard =
    mode === "merge"
      ? {
          projects: projectCandidates(doc),
          labels: labelCandidates(doc),
          cardIds: cardMaps(doc).map((c) => getString(c, "id")),
        }
      : { projects: fileProjects, labels: fileLabels };
  const resolution = resolveImport({
    file: { projects: fileProjects, labels: fileLabels, cards: snapshot.cards },
    board: {
      ...boardSide,
      // R20: an assignee who is not the importing user has no referent here.
      ...(opts.userId === undefined ? {} : { memberIds: [opts.userId] }),
    },
  });
  result.fusions = [...resolution.fusions];
  result.dropped = [...resolution.dropped];

  // Copy remaps every id the file brought to a fresh one (R8). One map per kind:
  // a hand-authored file may reuse the same string as a card id and a project
  // id, and those must not collapse onto one generated id.
  const substitutions: Record<"project" | "label" | "card", Map<string, string>> = {
    project: new Map(),
    label: new Map(),
    card: new Map(),
  };
  const targetId = (kind: "project" | "label" | "card", fileId: string): string => {
    if (mode !== "copy") return fileId;
    const map = substitutions[kind];
    const held = map.get(fileId);
    if (held !== undefined) return held;
    const fresh = newId();
    map.set(fileId, fresh);
    return fresh;
  };
  const mapRefs = (refs: ResolvedCardRefs): ResolvedCardRefs => ({
    labelIds: refs.labelIds.map((id) => targetId("label", id)),
    relatedIds: refs.relatedIds.map((id) => targetId("card", id)),
    ...(refs.projectId === undefined ? {} : { projectId: targetId("project", refs.projectId) }),
    ...(refs.assigneeId === undefined ? {} : { assigneeId: refs.assigneeId }),
  });

  // Replace and copy create every entity the file carries; merge creates only
  // what resolution could not match.
  const createdProjects =
    mode === "merge"
      ? new Set(resolution.projects.create.map((p) => p.id))
      : new Set(snapshot.projects.map((p) => p.id));
  const createdLabels =
    mode === "merge"
      ? new Set(resolution.labels.create.map((l) => l.id))
      : new Set(snapshot.labels.map((l) => l.id));

  // ----- projects -----
  const projects = boardProjects(doc);
  const projectOrds = new OrdAllocator(
    clientId,
    maxOrdOf(projectMaps(doc).map((p) => getString(p, "ord"))),
  );
  const seenProjects = new Set<string>();
  for (const project of snapshot.projects) {
    if (seenProjects.has(project.id)) continue;
    seenProjects.add(project.id);
    if (!createdProjects.has(project.id)) {
      result.projects.skipped += 1;
      continue;
    }
    const ord = project.ord && mode !== "copy" ? project.ord : projectOrds.next();
    projectOrds.observe(ord);
    writeProject(projects, targetId("project", project.id), project, ord);
    result.projects.created += 1;
  }

  // ----- labels -----
  const labels = boardLabels(doc);
  const labelOrds = new OrdAllocator(
    clientId,
    maxOrdOf(labelMaps(doc).map((l) => getString(l, "ord"))),
  );
  const seenLabels = new Set<string>();
  for (const label of snapshot.labels) {
    if (seenLabels.has(label.id)) continue;
    seenLabels.add(label.id);
    if (!createdLabels.has(label.id)) {
      result.labels.skipped += 1;
      continue;
    }
    const ord = label.ord && mode !== "copy" ? label.ord : labelOrds.next();
    labelOrds.observe(ord);
    writeLabel(labels, targetId("label", label.id), label, ord);
    result.labels.created += 1;
  }

  // ----- cards -----
  const cards = boardCards(doc);
  const existing = cardMaps(doc);
  const tickets = new TicketNumbers(
    mode === "replace" ? 0 : getNumber(meta, "shortIdSeq"),
    mode === "replace" ? [] : existing.map((c) => getNumber(c, "number")),
  );
  const allocators = statusAllocators(doc, clientId);
  const relations: [string, string][] = [];
  const creates: PlannedCard[] = [];
  const seenCards = new Set<string>();

  for (const card of snapshot.cards) {
    if (seenCards.has(card.id)) continue;
    seenCards.add(card.id);
    const raw = resolution.cards.get(card.id);
    if (raw === undefined) continue;
    const id = targetId("card", card.id);
    const refs = mapRefs(raw);

    const board = mode === "merge" ? cards.get(card.id) : undefined;
    if (board instanceof Y.Map) {
      // R12: a file older than the board makes no claim on the card. An absent
      // or zero `updatedAt` carries no claim at all and is applied.
      const boardUpdatedAt = getNumber(board, "updatedAt");
      if (card.updatedAt > 0 && card.updatedAt < boardUpdatedAt) {
        result.cards.skipped += 1;
        result.stale.push({
          cardId: card.id,
          title: getString(board, "title"),
          fileUpdatedAt: card.updatedAt,
          boardUpdatedAt,
        });
        // A card we declined to touch gets none of its relations written either.
        continue;
      }
      if (updateCard(board, card, refs, now, allocators, clientId)) result.cards.updated += 1;
      else result.cards.skipped += 1;
      for (const other of refs.relatedIds) relations.push([id, other]);
      continue;
    }

    creates.push({ id, source: card, refs });
  }

  // New cards land after everything already in their status (R14), in the file's
  // own order: its `ord` where it has one, array order otherwise.
  const ordered = creates
    .map((planned, index) => ({ planned, index }))
    .sort((a, b) => {
      const aOrd = a.planned.source.ord ?? "";
      const bOrd = b.planned.source.ord ?? "";
      if ((aOrd === "") !== (bOrd === "")) return aOrd === "" ? 1 : -1;
      if (aOrd !== bOrd) return compareOrd(aOrd, bOrd);
      return a.index - b.index;
    })
    .map((entry) => entry.planned);

  for (const planned of ordered) {
    const { id, source, refs } = planned;
    const allocator = allocatorFor(allocators, source.status, clientId);
    // Replace rebuilds the file as it was, so its keys are kept verbatim; merge
    // and copy append instead, because the file's keys mean nothing here (R14).
    const ord = mode === "replace" && source.ord ? source.ord : allocator.next();
    allocator.observe(ord);
    cards.set(id, buildCard({ id, number: tickets.take(source.number), ord, source, refs }, now));
    for (const other of refs.relatedIds) relations.push([id, other]);
    result.cards.created += 1;
  }

  writeRelations(doc, relations);

  // ----- board meta -----
  // Only replace writes board identity: merge and copy pull content into the
  // board the user is already using and must not rename it (R6, R7).
  if (mode === "replace") {
    meta.set("title", opts.title ?? snapshot.board.title);
    // Absent means the board had none, so replace removes what is there rather
    // than leaving the old value or writing an empty one. Both keys are optional
    // on the read side too (`boardToPlain` omits them when meta has no value),
    // so anything else makes export → replace → export unequal.
    if (snapshot.board.icon === undefined) meta.delete("icon");
    else meta.set("icon", snapshot.board.icon);
    if (snapshot.board.description === undefined) meta.delete("description");
    else setText(meta, "description", snapshot.board.description);
    meta.set("shortIdPrefix", snapshot.board.shortIdPrefix);
    meta.set(
      "badgeConfig",
      snapshot.board.badgeConfig.length
        ? [...snapshot.board.badgeConfig]
        : [...DEFAULT_BADGE_CONFIG],
    );
    // A file that predates saved views (v1) carries none; that is not an
    // instruction to discard the board's own (R6).
    if (snapshot.views.length > 0) {
      meta.set(
        "views",
        snapshot.views.map((view): SavedView => ({ ...view })),
      );
    }
    // `zoom` and `showEmptyColumns` are deliberately absent: device state, not
    // board content, so replace leaves whatever this device is set to (R6).
  }

  setIfChanged(meta, "shortIdSeq", tickets.high);
  if (!meta.has("createdAt")) meta.set("createdAt", now);
  meta.set("updatedAt", now);

  return result;
}

/**
 * Apply a snapshot to a board doc in one of the three import modes, and report
 * what it did (R17).
 *
 * The apply is staged in a detached `Y.Doc` and only lands on `doc` on a clean
 * completion, so a throw anywhere inside leaves the board byte-identical
 * (KTD8, R18, R25). What reaches the live doc is a single update, which is also
 * what peers see.
 */
export function applySnapshot(
  doc: Y.Doc,
  snapshot: BoardSnapshot,
  opts: ApplySnapshotOptions,
): ImportResult {
  const staging = new Y.Doc();
  Y.applyUpdate(staging, Y.encodeStateAsUpdate(doc));

  // Anything below this line that throws discards `staging` and nothing else.
  const result = stage(staging, snapshot, opts);

  // Only what staging added or deleted relative to the live doc — including the
  // delete set, which is how a replace's clear reaches the board and its peers.
  const update = Y.encodeStateAsUpdate(staging, Y.encodeStateVector(doc));
  staging.destroy();
  doc.transact(() => {
    Y.applyUpdate(doc, update);
  });
  return result;
}

/**
 * Populate a board doc from a snapshot, replacing whatever it held.
 *
 * Kept as the pre-UNIT-21 entry point (`packages/commands` and the older tests
 * call it) and as the fresh-doc build path. It is `applySnapshot` in `replace`
 * mode — the create-once guard it used to open with is gone: it fired on every
 * real call once the board became one doc per user, which made import a silent
 * no-op (`docs/solutions/logic-errors/import-no-op-after-single-doc-migration.md`).
 */
export function buildBoardFromSnapshot(doc: Y.Doc, snapshot: BoardSnapshot, now: number): void {
  applySnapshot(doc, snapshot, { mode: "replace", now });
}
