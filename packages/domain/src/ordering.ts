// Fractional ordering for cards and columns. A reorder is a single `ord`
// string write — never an array-of-ids rewrite (the Focalboard lesson + the
// Yjs move-duplication pitfall).
//
// An `ord` is a composite: `<fractional-key>-<clientId>`. The fractional key
// (from `fractional-indexing`) provides the primary order; the `clientId`
// suffix is a per-client tie-breaker so two clients inserting between the SAME
// neighbors (a concurrent-offline insert) produce DIFFERENT keys that both
// still sort strictly between those neighbors, converging to one deterministic
// total order across replicas. `-` (0x2D) separates the two parts and sorts
// lower than every character in the fractional-indexing alphabet (`0`–`z`), so
// plain lexicographic string comparison respects "frac first, then clientId".
import { generateKeyBetween } from "fractional-indexing";

const SEP = "-";

/** Extract the fractional-key portion of an `ord` (drops the clientId suffix). */
export function fracOf(ord: string): string {
  const i = ord.indexOf(SEP);
  return i === -1 ? ord : ord.slice(0, i);
}

function fracOfNullable(ord: string | null): string | null {
  return ord == null ? null : fracOf(ord);
}

/**
 * A key that sorts strictly between `a` and `b` (either may be `null` for the
 * start/end of the list), tagged with `clientId` as a tie-breaker.
 */
export function keyBetween(a: string | null, b: string | null, clientId: string): string {
  const frac = generateKeyBetween(fracOfNullable(a), fracOfNullable(b));
  return `${frac}${SEP}${clientId}`;
}

/** Total-order comparator for `ord` strings (lexicographic). */
export function compareOrd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Comparator over objects carrying an `ord`, for sorting selector output. */
export function byOrd<T extends { ord: string }>(a: T, b: T): number {
  return compareOrd(a.ord, b.ord);
}
