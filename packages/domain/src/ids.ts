// Entity id generation and ticket-id (`TEC-142` / `#142`) formatting/parsing.
//
// A card stores an integer `number` (allocated from the board's single
// `shortIdSeq` counter). The board stores a display-only `shortIdPrefix`
// (uppercase, ≤5 chars, may be empty). The human-facing ticket id is derived at
// read time: `#{number}` when the prefix is empty, `{PREFIX}-{number}` when set.
// Because the number is stored and the prefix is applied only for display,
// changing the prefix is safe and reversible — it never renumbers anything.

/** Opaque entity identifier (uuid v4). */
export type Id = string;

/** Generate a fresh entity id. Uses the platform Web Crypto UUID (Node 20+ / browsers). */
export function newId(): Id {
  return globalThis.crypto.randomUUID();
}

/**
 * Format the human-facing ticket id from a board prefix + integer number.
 * `formatTicketId("TEC", 42)` → `"TEC-42"`; `formatTicketId("", 42)` → `"#42"`.
 */
export function formatTicketId(prefix: string, number: number): string {
  return prefix === "" ? `#${number}` : `${prefix}-${number}`;
}

/**
 * Normalize a user-entered ticket prefix: uppercase, keep only `[A-Z0-9]`, and
 * cap at 5 characters. An empty result is valid (renders ids as `#{number}`).
 */
export function normalizeTicketPrefix(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

/** Format a legacy prefixed short id, e.g. `formatShortId("BRD", 142)` → `"BRD-142"`. */
export function formatShortId(prefix: string, seq: number): string {
  return `${prefix}-${seq}`;
}

const SHORT_ID_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

/** Parse a prefixed short id back into its prefix + sequence, or `null` if malformed. */
export function parseShortId(shortId: string): { prefix: string; seq: number } | null {
  const match = SHORT_ID_RE.exec(shortId);
  if (!match) return null;
  const [, prefix, seqStr] = match;
  if (prefix === undefined || seqStr === undefined) return null;
  return { prefix, seq: Number(seqStr) };
}

/** Minimal card shape needed to repair ticket-number collisions. */
export interface TicketNumberCard {
  id: Id;
  number: number;
  createdAt: number;
}

// Deterministic total order used both to pick the collision "keeper" and to
// order the displaced cards for reassignment. `(createdAt, id)` is identical on
// every replica, so the repair result is stable everywhere without any write.
function compareByCreatedThenId(a: TicketNumberCard, b: TicketNumberCard): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Repair duplicate ticket numbers caused by concurrent offline creation (two
 * clients grabbing the same `shortIdSeq`, merged by the CRDT). Returns a map of
 * `cardId → new number` for the cards that must change; for each colliding
 * number the earliest `(createdAt, id)` card keeps it and the rest are
 * reassigned to fresh numbers beyond the current max. Pure and deterministic —
 * every replica computes the same result from the same cards, so it can run on
 * read with no mutation.
 */
export function repairTicketNumbers(cards: TicketNumberCard[]): Map<string, number> {
  const overrides = new Map<string, number>();
  const byNumber = new Map<number, TicketNumberCard[]>();
  let maxNumber = 0;

  for (const card of cards) {
    maxNumber = Math.max(maxNumber, card.number);
    const group = byNumber.get(card.number);
    if (group) group.push(card);
    else byNumber.set(card.number, [card]);
  }

  const displaced: TicketNumberCard[] = [];
  for (const group of byNumber.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(compareByCreatedThenId);
    for (let i = 1; i < sorted.length; i++) displaced.push(sorted[i]!);
  }

  displaced.sort(compareByCreatedThenId);
  let next = maxNumber + 1;
  for (const card of displaced) {
    overrides.set(card.id, next);
    next += 1;
  }
  return overrides;
}
