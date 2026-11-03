import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { decodeHtmlEntities, shortLabelFor, usableTitle } from "@boardly/domain";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Database } from "../db/client";
import { linkMetadataCache } from "../db/schema";

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0) return true; // "this" network / unspecified
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true; // loopback / unspecified
  if (x.startsWith("fe80")) return true; // link-local
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // unique-local fc00::/7
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(x);
  if (mapped) return isBlockedIpv4(mapped[1]!);
  return false;
}

/** True for loopback / private / link-local / reserved addresses (SSRF targets). */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP → block
}

export class UnfurlBlockedError extends Error {
  constructor(message = "blocked") {
    super(message);
    this.name = "UnfurlBlockedError";
  }
}

export type DnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const defaultLookup: DnsLookup = (hostname) => dnsLookup(hostname, { all: true });

/** Drop the fragment; canonicalize. Throws for non-http(s) or invalid URLs. */
export function normalizeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnfurlBlockedError("invalid url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnfurlBlockedError("unsupported scheme");
  }
  url.hash = "";
  return url;
}

/**
 * Reject a URL whose host is (or resolves to) a private/loopback/link-local
 * address. Literal-IP hosts are checked directly; names are resolved and every
 * returned address must be public. Call again on each redirect hop.
 */
export async function assertFetchableUrl(url: URL, lookup: DnsLookup): Promise<void> {
  const host = url.hostname;
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new UnfurlBlockedError("blocked host");
    return;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host);
  } catch {
    throw new UnfurlBlockedError("dns failure");
  }
  if (addrs.length === 0) throw new UnfurlBlockedError("dns failure");
  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new UnfurlBlockedError("blocked host");
  }
}

// ---------------------------------------------------------------------------
// HTML metadata parsing
// ---------------------------------------------------------------------------

function metaContent(html: string, property: string): string | undefined {
  const attr = `(?:property|name)=["']${property}["']`;
  const a = new RegExp(`<meta[^>]+${attr}[^>]+content=["']([^"']*)["']`, "i").exec(html);
  if (a?.[1]) return a[1];
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}`, "i").exec(html);
  return b?.[1];
}

export interface Unfurled {
  title?: string;
  iconUrl?: string;
}

/**
 * Extract a display title + icon URL from HTML (OpenGraph first, then
 * title/favicon). Entity decoding and the interstitial/error-page guard live in
 * `@boardly/domain` (`usableTitle`) so this route and the desktop-native parse
 * in `apps/web/lib/unfurl-client.ts` agree on what counts as a title.
 */
export function parseMetadata(html: string, baseUrl: string): Unfurled {
  const rawTitle = metaContent(html, "og:title") ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const title = usableTitle(rawTitle, shortLabelFor(baseUrl));

  const iconHref =
    metaContent(html, "og:image") ??
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i.exec(html)?.[1];

  const iconUrl = resolveIcon(iconHref, baseUrl);
  return { title, iconUrl };
}

/**
 * Resolve an icon href to an http(s) URL, ignoring `data:`/invalid ones. The
 * href is entity-decoded first: an `og:image` with query parameters arrives as
 * `...?f=webp&amp;region=us`, and passing that through left a literal `&amp;`
 * in the stored URL.
 */
function resolveIcon(href: string | undefined, baseUrl: string): string | undefined {
  for (const candidate of [
    href === undefined ? undefined : decodeHtmlEntities(href),
    "/favicon.ico",
  ]) {
    if (!candidate) continue;
    try {
      const resolved = new URL(candidate, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") return resolved.href;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Fetching (timeout + size cap + redirect re-validation)
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 5_000;
/**
 * Hard ceiling on how much of a response body we buffer. `readCapped` normally
 * stops at `</head>` long before this, so the cap only bites on a page with no
 * closing head tag in the first 2 MB.
 *
 * It was 512 KB, which silently broke large single-page apps: YouTube's watch
 * page is ~1.39 MB and its `<head>` does not start until byte ~760,000, so the
 * cap truncated the body before any `og:title`/`<title>` and every YouTube link
 * fell through to the hostname fallback.
 */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 7 * 86_400_000;

type FetchImpl = typeof fetch;

/** Everything `parseMetadata` reads lives above this, so it ends the read. */
const HEAD_END = "</head>";

/**
 * Buffer the response body until `</head>` (everything we parse lives there),
 * `maxBytes`, or EOF — whichever comes first. Decodes incrementally so a
 * multi-byte character straddling a chunk boundary survives, and advances the
 * search offset so the scan stays linear over a multi-megabyte page.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  let searchFrom = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (text.indexOf(HEAD_END, searchFrom) !== -1) {
      await reader.cancel();
      break;
    }
    // Rewind by needle-length-1 so a tag split across two chunks is still seen.
    searchFrom = Math.max(0, text.length - (HEAD_END.length - 1));
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}

/** What the route identifies itself as. Some hosts answer only a browser-like UA. */
export const UNFURL_USER_AGENT = "BoardlyBot/1.0";

/**
 * Fetch `url` and parse its title/icon, following up to `MAX_REDIRECTS` hops
 * and re-running the SSRF guard on every one. `null` for a non-2xx answer or
 * too many redirects; throws `UnfurlBlockedError` for a blocked target.
 * Exported for the title backfill (`src/scripts/backfill-link-titles.ts`).
 */
export async function fetchHtml(
  url: URL,
  deps: { fetchImpl: FetchImpl; lookup: DnsLookup; userAgent?: string },
): Promise<Unfurled | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertFetchableUrl(current, deps.lookup); // re-validate every hop
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await deps.fetchImpl(current.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": deps.userAgent ?? UNFURL_USER_AGENT,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new UnfurlBlockedError("unsupported redirect scheme");
      }
      continue;
    }
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return { title: undefined, iconUrl: undefined };
    const html = await readCapped(res, MAX_BYTES);
    return parseMetadata(html, current.href);
  }
  return null; // too many redirects
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface UnfurlRoutesOptions {
  db: Database;
  /** Injectable for tests. */
  fetchImpl?: FetchImpl;
  lookup?: DnsLookup;
  now?: () => number;
}

const querySchema = z.object({ url: z.string().min(1).max(2048) });

export async function unfurlRoutes(app: FastifyInstance, opts: UnfurlRoutesOptions): Promise<void> {
  const { db } = opts;
  const fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const lookup = opts.lookup ?? defaultLookup;
  const now = opts.now ?? Date.now;

  app.get("/api/unfurl", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request" });

    let url: URL;
    try {
      url = normalizeUrl(parsed.data.url);
    } catch {
      return reply.status(400).send({ error: "invalid url" });
    }
    const key = url.href;

    // Cache hit (fresh) → serve without a network fetch.
    const [cached] = await db
      .select()
      .from(linkMetadataCache)
      .where(eq(linkMetadataCache.url, key))
      .limit(1);
    if (cached && now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      return reply.send({ title: cached.title ?? undefined, iconUrl: cached.iconUrl ?? undefined });
    }

    let result: Unfurled | null;
    try {
      result = await fetchHtml(url, { fetchImpl, lookup });
    } catch (error) {
      if (error instanceof UnfurlBlockedError) {
        return reply.status(400).send({ error: "url not allowed" });
      }
      result = null; // network/timeout → graceful fallback below
    }

    if (!result) {
      // Graceful fallback: no title, never a 500 — the chip keeps its own short
      // label. Not the hostname: for a brand-only provider that would replace
      // "LinkedIn" with "www.linkedin.com", and for a generic link the short
      // label already is the hostname.
      return reply.send({});
    }

    const fetchedAt = new Date(now());
    await db
      .insert(linkMetadataCache)
      .values({ url: key, title: result.title ?? null, iconUrl: result.iconUrl ?? null, fetchedAt })
      .onConflictDoUpdate({
        target: linkMetadataCache.url,
        set: { title: result.title ?? null, iconUrl: result.iconUrl ?? null, fetchedAt },
      });

    return reply.send({ title: result.title, iconUrl: result.iconUrl });
  });
}
