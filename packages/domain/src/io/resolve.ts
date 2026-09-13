// Import entity resolution: given the entities in a file and the entities on the
// board the user is already using, decide what maps to what. Pure — no Yjs, no
// I/O, no writes. The caller (the sync/command layer) performs the mapping this
// module returns; deciding it here keeps the name-matching rules unit-testable
// without constructing a `Y.Doc`, and preserves the `io/` split in which
// `packages/domain` never imports `packages/sync`.
//
// The rules (UNIT-21):
//
//   R10 — a file project/label resolves by id, then by normalized name among
//         *non-archived* board entities, then by creation. On a name match the
//         board's entity survives with its own id, name, color and archived
//         state, and the file's cards are repointed to it. File entities are
//         resolved in file order against a candidate set that GROWS as entities
//         are created, so two file entities that normalize alike fuse into one
//         target instead of reproducing the duplicate the rule exists to
//         prevent. Every fusion is reported — a collapse is never silent.
//   R11 — resolution never changes an existing entity's archived state. Nothing
//         returned here can: the result is ids, a creation list and diagnostics.
//   R13 — a reference that resolves to no entity (label, project, related card)
//         is dropped rather than written; the card itself still imports.
import { slugify } from "../ids";

/** The two board-level collections that fuse by name. */
export type ResolvedEntityKind = "project" | "label";

/**
 * The minimum shape resolution needs from an entity, on either side.
 * Structural on purpose: the file side is a parsed snapshot entity and the
 * board side is read out of Yjs by the caller, and neither type belongs here.
 * `archived` is absent on kinds that cannot be archived (labels today) and is
 * read as "active".
 */
export interface ResolvableEntity {
  id: string;
  name: string;
  ord: string;
  archived?: boolean;
}

/** One reported collapse: a file entity folded into a surviving entity. */
export interface EntityFusion {
  kind: ResolvedEntityKind;
  /** The file entity that ceased to exist as a separate thing. */
  fromId: string;
  fromName: string;
  /** The survivor, which keeps its own id, name, color and archived state. */
  intoId: string;
  intoName: string;
  /**
   * Whether the survivor was already on the board, or was created earlier in
   * this same import (two file entities normalizing alike).
   */
  into: "board" | "created";
  /** The normalized name both sides share. */
  nameKey: string;
}

export interface EntityResolution<T extends ResolvableEntity = ResolvableEntity> {
  /**
   * Every file entity id → the id it resolves to. Total over the input: an
   * entity that is created maps to itself, so one lookup answers any file id.
   */
  remap: ReadonlyMap<string, string>;
  /** File entities that matched nothing and must be created, in file order. */
  create: readonly T[];
  fusions: readonly EntityFusion[];
}

/**
 * The name key two entities must share to be "the same name". Reuses
 * {@link slugify} — the codebase's single notion of a folded name (diacritics
 * folded, lowercased, non-alphanumerics collapsed) — with its decorative
 * 60-character cap lifted, so two long names sharing a prefix stay distinct.
 *
 * An empty key means the name has no Latin alphanumerics at all (non-Latin
 * script, emoji, punctuation). Such names never enter the name-match arm: they
 * would otherwise all read as "the same name" as each other.
 */
export function normalizeEntityName(name: string): string {
  return slugify(name, Number.POSITIVE_INFINITY);
}

/**
 * Total, replica-stable order over candidates. `ord` decides; `id` breaks a tie
 * (two replicas can concurrently produce equal ords), so every replica picks the
 * same survivor from the same set regardless of iteration order.
 */
function compareOrdThenId(a: ResolvableEntity, b: ResolvableEntity): number {
  if (a.ord !== b.ord) return a.ord < b.ord ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

interface Candidate {
  entity: ResolvableEntity;
  origin: "board" | "created";
}

/**
 * Resolve one kind of entity: id, then normalized name among active entities,
 * then create. See the rules at the top of this file.
 */
export function resolveEntities<T extends ResolvableEntity>(
  kind: ResolvedEntityKind,
  fileEntities: readonly T[],
  boardEntities: readonly ResolvableEntity[],
): EntityResolution<T> {
  const remap = new Map<string, string>();
  const create: T[] = [];
  const fusions: EntityFusion[] = [];

  // Id lookup spans archived entities too: an id match is an identity, not a
  // revival, and matching it changes nothing about the board entity (R11).
  const byId = new Map<string, ResolvableEntity>();
  for (const entity of boardEntities) {
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
  }

  // Name lookup spans active entities only, lowest (ord, id) winning a tie.
  const byName = new Map<string, Candidate>();
  for (const entity of boardEntities) {
    if (entity.archived === true) continue;
    const key = normalizeEntityName(entity.name);
    if (key === "") continue;
    const held = byName.get(key);
    if (held === undefined || compareOrdThenId(entity, held.entity) < 0) {
      byName.set(key, { entity, origin: "board" });
    }
  }

  for (const entity of fileEntities) {
    // A repeated id inside one file is one entity, resolved once.
    if (remap.has(entity.id)) continue;

    const sameId = byId.get(entity.id);
    if (sameId !== undefined) {
      remap.set(entity.id, sameId.id);
      continue;
    }

    const key = normalizeEntityName(entity.name);
    const match = key === "" ? undefined : byName.get(key);
    if (match !== undefined) {
      remap.set(entity.id, match.entity.id);
      fusions.push({
        kind,
        fromId: entity.id,
        fromName: entity.name,
        intoId: match.entity.id,
        intoName: match.entity.name,
        into: match.origin,
        nameKey: key,
      });
      continue;
    }

    create.push(entity);
    remap.set(entity.id, entity.id);
    // The candidate set grows: a later file entity with this id or name fuses
    // into the one just created rather than duplicating it. An entity created
    // archived is no more name-matchable than an archived board entity.
    byId.set(entity.id, entity);
    if (key !== "" && entity.archived !== true) {
      byName.set(key, { entity, origin: "created" });
    }
  }

  return { remap, create, fusions };
}

/** The reference-bearing fields of a card. Everything else imports untouched. */
export interface CardRefs {
  id: string;
  projectId?: string;
  labelIds?: readonly string[];
  assigneeId?: string;
  relatedIds?: readonly string[];
}

export type DroppedRefField = "projectId" | "labelIds" | "assigneeId" | "relatedIds";

/** One reference that resolved to nothing and will not be written (R13). */
export interface DroppedRef {
  cardId: string;
  field: DroppedRefField;
  /** The id in the file that resolved to nothing. */
  value: string;
}

/**
 * A card's references after resolution. Absent `projectId`/`assigneeId` mean
 * "no reference" — either the card had none or its reference was dropped. There
 * is deliberately no `archived` here: resolution decides ids, never lifecycle.
 */
export interface ResolvedCardRefs {
  projectId?: string;
  labelIds: string[];
  assigneeId?: string;
  relatedIds: string[];
}

export interface ImportResolutionInput<
  P extends ResolvableEntity = ResolvableEntity,
  L extends ResolvableEntity = ResolvableEntity,
> {
  file: {
    projects?: readonly P[];
    labels?: readonly L[];
    cards?: readonly CardRefs[];
  };
  board: {
    projects?: readonly ResolvableEntity[];
    labels?: readonly ResolvableEntity[];
    /** Ids of cards already on the board, for resolving `relatedIds`. */
    cardIds?: readonly string[];
    /**
     * Ids that may hold an assignment. A pure resolver has no notion of "the
     * importing user", so this is the caller's to supply: **omit it and every
     * `assigneeId` passes through untouched** (the conservative default — R13
     * names labels, projects and related cards, not assignees). Supply it and
     * an assignee outside the list is dropped and reported like any other
     * unresolvable reference.
     */
    memberIds?: readonly string[];
  };
}

export interface ImportResolution<
  P extends ResolvableEntity = ResolvableEntity,
  L extends ResolvableEntity = ResolvableEntity,
> {
  projects: EntityResolution<P>;
  labels: EntityResolution<L>;
  /** File card id → its resolved references. One entry per card in the file. */
  cards: ReadonlyMap<string, ResolvedCardRefs>;
  /** Every project fusion, then every label fusion. */
  fusions: readonly EntityFusion[];
  dropped: readonly DroppedRef[];
}

/** Resolve a reference: the remap first, then an id that already exists. */
function resolveRef(
  id: string,
  remap: ReadonlyMap<string, string>,
  boardIds: ReadonlySet<string>,
): string | undefined {
  const mapped = remap.get(id);
  if (mapped !== undefined) return mapped;
  return boardIds.has(id) ? id : undefined;
}

/**
 * Resolve a whole import: both entity kinds, then every card's references
 * against the resulting remap plus what the board already holds.
 */
export function resolveImport<P extends ResolvableEntity, L extends ResolvableEntity>(
  input: ImportResolutionInput<P, L>,
): ImportResolution<P, L> {
  const fileCards = input.file.cards ?? [];
  const boardProjects = input.board.projects ?? [];
  const boardLabels = input.board.labels ?? [];

  const projects = resolveEntities("project", input.file.projects ?? [], boardProjects);
  const labels = resolveEntities("label", input.file.labels ?? [], boardLabels);

  // Board ids are matchable regardless of archived state: a card may legitimately
  // point at an archived project, and moving it would be a lifecycle change (R11).
  const boardProjectIds = new Set(boardProjects.map((project) => project.id));
  const boardLabelIds = new Set(boardLabels.map((label) => label.id));
  const memberIds =
    input.board.memberIds === undefined ? undefined : new Set(input.board.memberIds);

  // A relation may point at a card already on the board or at one arriving in
  // this same file; anything else has no referent at all.
  const cardIds = new Set<string>(input.board.cardIds ?? []);
  for (const card of fileCards) cardIds.add(card.id);

  const cards = new Map<string, ResolvedCardRefs>();
  const dropped: DroppedRef[] = [];

  for (const card of fileCards) {
    if (cards.has(card.id)) continue;
    const resolved: ResolvedCardRefs = { labelIds: [], relatedIds: [] };

    if (card.projectId !== undefined && card.projectId !== "") {
      const target = resolveRef(card.projectId, projects.remap, boardProjectIds);
      if (target === undefined) {
        dropped.push({ cardId: card.id, field: "projectId", value: card.projectId });
      } else {
        resolved.projectId = target;
      }
    }

    for (const labelId of card.labelIds ?? []) {
      const target = resolveRef(labelId, labels.remap, boardLabelIds);
      if (target === undefined) {
        dropped.push({ cardId: card.id, field: "labelIds", value: labelId });
        continue;
      }
      // A fusion can send two of the card's labels to one survivor.
      if (!resolved.labelIds.includes(target)) resolved.labelIds.push(target);
    }

    if (card.assigneeId !== undefined && card.assigneeId !== "") {
      if (memberIds === undefined || memberIds.has(card.assigneeId)) {
        resolved.assigneeId = card.assigneeId;
      } else {
        dropped.push({ cardId: card.id, field: "assigneeId", value: card.assigneeId });
      }
    }

    for (const relatedId of card.relatedIds ?? []) {
      if (!cardIds.has(relatedId)) {
        dropped.push({ cardId: card.id, field: "relatedIds", value: relatedId });
        continue;
      }
      if (!resolved.relatedIds.includes(relatedId)) resolved.relatedIds.push(relatedId);
    }

    cards.set(card.id, resolved);
  }

  return {
    projects,
    labels,
    cards,
    fusions: [...projects.fusions, ...labels.fusions],
    dropped,
  };
}
