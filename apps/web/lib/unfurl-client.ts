// Client-side unfurl for generic links: title + favicon. On web it calls the
// server's `/api/unfurl` (Unit 3.7, which owns the SSRF defenses). On desktop
// (Unit 5.2) it fetches the page directly with Tauri's native HTTP plugin —
// CORS-free, no server round-trip — and parses the title/icon locally. Any
// failure returns null so the card falls back to the hostname; never breaks.
import { isPublicHttpUrl } from "@boardly/domain";

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

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .trim();

/**
 * Extract a page title and favicon from raw HTML (pure, testable). Prefers
 * `og:title` then `<title>`; resolves the first `<link rel~="icon">` (or the
 * default `/favicon.ico`) against the page URL.
 */
export function parseUnfurl(html: string, pageUrl: string): Unfurled {
  const result: Unfurled = {};

  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = og?.[1] ?? titleTag?.[1];
  if (title) {
    const clean = decodeEntities(title.replace(/\s+/g, " "));
    if (clean) result.title = clean;
  }

  let iconHref: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\brel=["'][^"']*\bicon\b[^"']*["']/i.test(tag)) {
      iconHref = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
      if (iconHref) break;
    }
  }
  try {
    result.iconUrl = new URL(iconHref ?? "/favicon.ico", pageUrl).href;
  } catch {
    // leave iconUrl unset on a malformed URL
  }
  return result;
}
