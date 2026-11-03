// Shared post-processing for an unfurled page title. Both unfurl paths — the
// server route (`apps/server/src/routes/unfurl.ts`) and the desktop/native
// parse (`apps/web/lib/unfurl-client.ts`) — run their raw `og:title`/`<title>`
// through `usableTitle` here, so the two platforms can never disagree about
// what counts as a title (they previously carried two divergent copies of the
// entity table, both with the same gap).

/** Named references worth handling; everything else arrives numerically. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ENTITY_RE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g;

/**
 * Decode HTML character references in a text node. Handles decimal (`&#233;`)
 * and hex (`&#x1ee2;`) forms as well as the handful of named ones that appear
 * in titles — a single pass, so `&amp;#39;` decodes to the literal `&#39;`
 * rather than being decoded twice.
 *
 * The previous per-call-site implementations allowlisted six references and let
 * every other one through verbatim, which rendered any non-ASCII title as raw
 * markup (a Vietnamese Facebook title came out as `CH&#x1ee2; GAMING GEAR`).
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY_RE, (match, dec: string, hex: string, name: string) => {
    if (name !== undefined) return NAMED[name.toLowerCase()] ?? match;
    const code = Number.parseInt(dec ?? hex, dec !== undefined ? 10 : 16);
    // Reject out-of-range and surrogate code points — `fromCodePoint` throws.
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
    if (code >= 0xd800 && code <= 0xdfff) return match;
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

/** Separator debris left when a site renders `<title>{empty} | {Brand}</title>`. */
const EDGE_SEPARATORS = /^[\s|·•—–\-:]+|[\s|·•—–\-:]+$/g;

/**
 * Titles that identify an interstitial, a bot wall, or an error page rather
 * than the linked resource. Compared against the whole cleaned title AND
 * against its first `|`/`·`/`—`-delimited segment, which is how these arrive in
 * practice (`"Security Check | Wellfound"`).
 */
const NON_TITLES = new Set([
  "404",
  "access denied",
  "are you a robot",
  "attention required",
  "attention required! cloudflare",
  "bot verification",
  "captcha",
  "checking if the site connection is secure",
  "checking your browser",
  "error",
  "forbidden",
  "just a moment",
  "loading",
  "not found",
  "one moment please",
  "oops",
  "page not found",
  "please wait",
  "redirecting",
  "robot check",
  "security check",
  "security verification",
  "service unavailable",
  "site unavailable",
  "temporarily unavailable",
  "unauthorized",
  "untitled",
  "verify you are human",
]);

/**
 * An HTTP status code followed by its reason phrase (`"404: Page not found"`).
 * Anchored and paired deliberately — a bare leading-3-digit test would reject
 * legitimate titles like `"500 Startups"`.
 */
const STATUS_TITLE_RE =
  /^(?:4\d\d|5\d\d)\s*[:\-–—]?\s*(?:bad request|unauthorized|forbidden|not found|page not found|gone|too many requests|internal server error|bad gateway|service unavailable|gateway timeout|error)\b/i;

/**
 * Lowercase, collapse whitespace, drop edge separators and trailing
 * `.`/`!`/`?` — the comparison form only; the returned title keeps its
 * punctuation. The trailing strip is what lets `"Just a moment..."` and
 * Cloudflare's `"Attention Required!"` match the table below.
 */
function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(EDGE_SEPARATORS, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

/**
 * Clean a raw `og:title`/`<title>` and decide whether it is worth storing in
 * place of the provider's own short label.
 *
 * Returns `undefined` — meaning "keep the short label" — when the title is
 * empty, is the short label itself (LinkedIn job pages sometimes return the
 * bare string `"LinkedIn"`), or is an interstitial/error page. Without this
 * guard, routing the brand-only providers through unfurl trades a correct
 * `"session →"` for Cloudflare's `"Just a moment..."`.
 *
 * @param raw the title as extracted from the markup, still entity-encoded
 * @param shortLabel what the chip would otherwise render, for the equality test
 */
export function usableTitle(raw: string | undefined, shortLabel?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = decodeHtmlEntities(raw).replace(/\s+/g, " ").replace(EDGE_SEPARATORS, "").trim();
  if (cleaned.length < 2) return undefined;

  const normalized = normalize(cleaned);
  if (NON_TITLES.has(normalized) || STATUS_TITLE_RE.test(normalized)) return undefined;

  // `"Security Check | Wellfound"` — the resource half is the interstitial.
  const firstSegment = normalize(cleaned.split(/[|·•—–]/)[0] ?? "");
  if (firstSegment && NON_TITLES.has(firstSegment)) return undefined;

  if (shortLabel && normalized === normalize(shortLabel)) return undefined;
  return cleaned;
}
