// Entity id generation and ticket-id (`TEC-142` / `#142`) formatting/parsing.
//
// A card stores an integer `number` (allocated from the board's single
// `shortIdSeq` counter). The board stores a display-only `shortIdPrefix`
// (uppercase, ≤5 chars, may be empty). The human-facing ticket id is derived at
// read time: `#{number}` when the prefix is empty, `{PREFIX}-{number}` when set.
// Because the number is stored and the prefix is applied only for display,
// changing the prefix is safe and reversible — it never renumbers anything.

/** Opaque entity identifier: a short, URL-friendly random token. */
export type Id = string;

// Short ids (8 lowercase base36 chars ≈ 41 bits) instead of uuids: they read
// cleanly in URLs (`#p/<id>-<slug>`) and are hyphen-free, so a `<id>-<slug>`
// ref parses back to the id at the first hyphen. 36^8 ≈ 2.8e12 keeps collisions
// negligible for a personal board's entity counts, even with offline CRDT merges.
const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 8;

/** Generate a fresh short entity id. Uses Web Crypto (Node 20+ / browsers). */
export function newId(): Id {
  const buf = new Uint8Array(1);
  let out = "";
  while (out.length < ID_LENGTH) {
    globalThis.crypto.getRandomValues(buf);
    // Reject the top 4 of 256 so the modulo is unbiased (252 = 7 × 36).
    if (buf[0]! < 252) out += ID_ALPHABET[buf[0]! % 36];
  }
  return out;
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

/**
 * Kebab-case a title for a decorative URL slug: fold diacritics, lowercase,
 * collapse non-alphanumerics to single hyphens, trim, and cap length. The slug
 * is cosmetic — ticket URLs resolve by their integer, never by the slug.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Build the Linear-style ticket URL reference (the part after `#`): the display
 * id plus a decorative title slug. `formatTicketRef("TEC", 42, "Fix login")` →
 * `"TEC-42-fix-login"`; empty prefix → `"42-fix-login"`.
 */
export function formatTicketRef(prefix: string, number: number, title: string): string {
  const id = prefix === "" ? `${number}` : `${prefix}-${number}`;
  const slug = slugify(title);
  return slug ? `${id}-${slug}` : id;
}

/**
 * Extract the integer ticket number from a URL reference, tolerating an optional
 * `PREFIX-` and a trailing `-slug`. Resolution is by number only (prefix/slug are
 * cosmetic), so a stale prefix or edited title still resolves. Null if malformed.
 * `"TEC-42-fix"`, `"42-fix"`, `"TEC-42"`, `"42"` → 42.
 */
export function parseTicketRef(ref: string): number | null {
  const match = /^(?:[A-Za-z][A-Za-z0-9]*-)?(\d+)(?:-.*)?$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/**
 * Build a project URL reference: the (hyphen-free) project id plus a decorative
 * name slug — `formatProjectRef("k3f9a2xq", "Web app")` → `"k3f9a2xq-web-app"`.
 * The slug is cosmetic; {@link parseProjectRef} resolves by the id alone, so a
 * renamed project still opens from a stale URL.
 */
export function formatProjectRef(id: Id, name: string): string {
  const slug = slugify(name);
  return slug ? `${id}-${slug}` : id;
}

/**
 * Extract the project id from a `<id>-<slug>` reference. Entity ids are
 * hyphen-free (see {@link newId}), so the id is everything up to the first
 * hyphen; a bare id (no slug) is returned unchanged.
 */
export function parseProjectRef(ref: string): Id {
  const i = ref.indexOf("-");
  return i === -1 ? ref : ref.slice(0, i);
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
