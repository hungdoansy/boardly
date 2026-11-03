// Client-side unfurl for generic links: title + favicon. On web it calls the
// server's `/api/unfurl` (Unit 3.7, which owns the SSRF defenses). On desktop
// (Unit 5.2) it fetches the page directly with Tauri's native HTTP plugin —
// CORS-free, no server round-trip — and parses the title/icon locally. Any
// failure yields no title, so the chip keeps its short label; never breaks.
import { decodeHtmlEntities, isPublicHttpUrl, shortLabelFor, usableTitle } from "@boardly/domain";

import { API_BASE_URL } from "./api-client";
import { isTauri } from "./platform";

export interface Unfurled {
  title?: string;
  iconUrl?: string;
}

export async function unfurl(url: string): Promise<Unfurled | null> {
  // Pre-flight: never round-trip non-http(s) (javascript:/data: etc.).
  if (!/^https?:\/\//i.test(url)) return null;
  return isTauri() ? unfurlViaTauri(url) : unfurlViaServer(url);
}

/** Web path: the server unfurls (scheme allowlist, blocks loopback/RFC-1918, etc.). */
async function unfurlViaServer(url: string): Promise<Unfurled | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as Unfurled;
  } catch {
    return null;
  }
}

/** Desktop path: native fetch (no CORS), parse the HTML locally. */
async function unfurlViaTauri(url: string): Promise<Unfurled | null> {
  // The native fetch bypasses the server's SSRF guard, so require a public
  // HTTPS host before touching the network (see `isPublicHttpUrl`).
  if (!isPublicHttpUrl(url)) return null;
  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const res = await tauriFetch(url, { method: "GET" });
    if (!res.ok) return null;
    const html = await res.text();
    return parseUnfurl(html, url);
  } catch {
    return null;
  }
}

/**
 * Best-effort repo description for a bare `github.com/owner/repo` URL, via
 * GitHub's public REST API (CORS-enabled, no auth needed for public repos).
 * Returns undefined for anything else (PR/issue URLs, private/missing repos,
 * network failures) — never blocks adding the link.
 */
export async function fetchGithubRepoDescription(url: string): Promise<string | undefined> {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return undefined;
    const m = /^\/([^/]+)\/([^/]+)\/?$/.exec(parsed.pathname);
    if (!m) return undefined;
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { description?: string | null };
    return data.description ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract a page title and favicon from raw HTML (pure, testable). Prefers
 * `og:title` then `<title>`; resolves the first `<link rel~="icon">` (or the
 * default `/favicon.ico`) against the page URL.
 *
 * Entity decoding and the interstitial/error-page guard come from
 * `@boardly/domain` (`usableTitle`), shared with the server route so the web
 * and desktop paths cannot drift apart — they previously carried two separate
 * entity tables that both mishandled numeric references.
 */
export function parseUnfurl(html: string, pageUrl: string): Unfurled {
  const result: Unfurled = {};

  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = usableTitle(og?.[1] ?? titleTag?.[1], shortLabelFor(pageUrl));
  if (title) result.title = title;

  let iconHref: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\brel=["'][^"']*\bicon\b[^"']*["']/i.test(tag)) {
      iconHref = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
      if (iconHref) break;
    }
  }
  try {
    // Entity-decoded: an og:image/favicon href with query parameters arrives as
    // `...?f=webp&amp;region=us` and would otherwise keep the literal `&amp;`.
    const href = iconHref === undefined ? "/favicon.ico" : decodeHtmlEntities(iconHref);
    result.iconUrl = new URL(href, pageUrl).href;
  } catch {
    // leave iconUrl unset on a malformed URL
  }
  return result;
}
