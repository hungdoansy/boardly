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
