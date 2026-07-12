/**
 * Pure, in-memory search index for cards across all loaded boards.
 *
 * Kept free of React/Yjs so the ranking is deterministic and unit-testable. The
 * React binding (`useSearchDocs`) builds {@link SearchDoc}s from the board docs;
 * this module only scores and ranks them.
 */

/** A flattened, searchable projection of one card. */
export interface SearchDoc {
  cardId: string;
  boardTitle: string;
  title: string;
  description: string;
  shortId: string;
  labels: string[];
  updatedAt: number;
}

export interface SearchResult {
  doc: SearchDoc;
  score: number;
}

// Per-field weights: a hit in the short id or title ranks above one buried in
// the description. Multiplies the raw fuzzy score for that field.
const FIELD_WEIGHT = {
  shortId: 3,
  title: 2.2,
  labels: 1.6,
  board: 1.1,
  description: 1,
} as const;

const isAlnum = (ch: string | undefined): boolean => !!ch && /[a-z0-9]/i.test(ch);

/**
 * Score `query` against `text`. Returns `null` when `query` is not even a
 * subsequence of `text`; otherwise a positive number where higher is better.
 * A contiguous substring hit scores far above a scattered subsequence, and
 * prefix / word-boundary hits are rewarded — so "auth" ranks "Auth service"
 * above "authenticate the user" above "cauterize truth".
 */
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (q.length === 0) return 0;

  // Fast path: contiguous substring.
  const idx = t.indexOf(q);
  if (idx !== -1) {
    let score = 1000 - Math.min(idx, 400);
    if (idx === 0) score += 600;
    else if (!isAlnum(t[idx - 1])) score += 300;
    return score;
  }

  // Subsequence match with contiguity + boundary bonuses.
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    let found = -1;
    for (; ti < t.length; ti++) {
      if (t[ti] === ch) {
        found = ti;
        break;
      }
    }
    if (found === -1) return null;
    streak = found === ti && qi > 0 ? streak + 1 : 0;
    score += 1 + streak * 4;
    if (found === 0 || !isAlnum(t[found - 1])) score += 10;
    ti = found + 1;
  }
  return score;
}

/** Best weighted field score for a doc, or `null` if nothing matched. */
export function scoreDoc(doc: SearchDoc, query: string): number | null {
  const fields: [string, number][] = [
    [doc.shortId, FIELD_WEIGHT.shortId],
    [doc.title, FIELD_WEIGHT.title],
    [doc.labels.join(" "), FIELD_WEIGHT.labels],
    [doc.boardTitle, FIELD_WEIGHT.board],
    [doc.description, FIELD_WEIGHT.description],
  ];
  let best: number | null = null;
  for (const [text, weight] of fields) {
    const s = fuzzyScore(text, query);
    if (s !== null) best = Math.max(best ?? Number.NEGATIVE_INFINITY, s * weight);
  }
  return best;
}

/** Rank `docs` against `query`. Empty query → `[]` (callers show recents). */
export function searchDocs(docs: SearchDoc[], query: string, limit = 20): SearchResult[] {
  const q = query.trim();
  if (q.length === 0) return [];
  const scored: SearchResult[] = [];
  for (const doc of docs) {
    const score = scoreDoc(doc, q);
    if (score !== null) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt);
  return scored.slice(0, limit);
}

/** Most-recently-updated docs, for the empty-query state. */
export function recentDocs(docs: SearchDoc[], limit = 8): SearchDoc[] {
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}
