// Entity id generation and short-id (`BRD-142`) formatting/parsing.

/** Opaque entity identifier (uuid v4). */
export type Id = string;

/** Generate a fresh entity id. Uses the platform Web Crypto UUID (Node 20+ / browsers). */
export function newId(): Id {
  return globalThis.crypto.randomUUID();
}

/** Format a human-facing short id, e.g. `formatShortId("BRD", 142)` → `"BRD-142"`. */
export function formatShortId(prefix: string, seq: number): string {
  return `${prefix}-${seq}`;
}

const SHORT_ID_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

/** Parse a short id back into its prefix + sequence, or `null` if malformed. */
export function parseShortId(shortId: string): { prefix: string; seq: number } | null {
  const match = SHORT_ID_RE.exec(shortId);
  if (!match) return null;
  const [, prefix, seqStr] = match;
  if (prefix === undefined || seqStr === undefined) return null;
  return { prefix, seq: Number(seqStr) };
}

/** Minimal card shape needed to repair short-id collisions. */
export interface ShortIdCard {
  id: Id;
  shortId: string;
  createdAt: number;
}

// Deterministic total order used both to pick the collision "keeper" and to
// order the displaced cards for reassignment. `(createdAt, id)` is identical on
// every replica, so the repair result is stable everywhere without any write.
function compareCards(a: ShortIdCard, b: ShortIdCard): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Repair duplicate short ids caused by concurrent offline creation (two clients
 * grabbing the same `shortIdSeq`, merged by the CRDT). Returns a map of
 * `cardId → new shortId` for the cards that must change; for each colliding
 * short id the earliest `(createdAt, id)` card keeps it and the rest are
 * reassigned to fresh sequence numbers beyond the current max. Pure and
 * deterministic — every replica computes the same result from the same cards,
 * so it can run on read with no mutation.
 */
export function repairShortIds(cards: ShortIdCard[]): Map<string, string> {
  const overrides = new Map<string, string>();
  const byShortId = new Map<string, ShortIdCard[]>();
  let maxSeq = 0;
  let prefix = "BRD";

  for (const card of cards) {
    const parsed = parseShortId(card.shortId);
    if (parsed) {
      maxSeq = Math.max(maxSeq, parsed.seq);
      prefix = parsed.prefix;
    }
    const group = byShortId.get(card.shortId);
    if (group) group.push(card);
    else byShortId.set(card.shortId, [card]);
  }

  const displaced: ShortIdCard[] = [];
  for (const group of byShortId.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(compareCards);
    for (let i = 1; i < sorted.length; i++) displaced.push(sorted[i]!);
  }

  displaced.sort(compareCards);
  let next = maxSeq + 1;
  for (const card of displaced) {
    overrides.set(card.id, formatShortId(prefix, next));
    next += 1;
  }
  return overrides;
}
