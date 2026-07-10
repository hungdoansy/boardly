// Extensible link-provider registry — the single source of truth for provider
// detection + short labels, used by both the card link chips (UI) and the
// command layer. Adding a provider = one file in ./providers + one entry here.
import type { LinkProvider } from "../enums";
import { LinkProvider as LP } from "../enums";
import { claude } from "./providers/claude";
import { generic } from "./providers/generic";
import { githubIssue } from "./providers/github-issue";
import { githubPr } from "./providers/github-pr";
import { linear } from "./providers/linear";
import { slack } from "./providers/slack";

export interface LinkProviderDef {
  id: LinkProvider;
  /** True if this provider handles the (already-parsed) URL. */
  match(url: URL): boolean;
  /** Compact, scannable chip label. */
  shortLabel(url: URL): string;
}

/** Ordered; `generic` is last so it never shadows a specific provider. */
export const PROVIDERS: LinkProviderDef[] = [slack, linear, githubPr, githubIssue, claude, generic];

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function providerFor(parsed: URL): LinkProviderDef {
  return PROVIDERS.find((p) => p.match(parsed)) ?? generic;
}

/** Detect the provider id for a URL; malformed/relative → generic (no throw). */
export function detectProvider(url: string): LinkProvider {
  const parsed = safeUrl(url);
  return parsed ? providerFor(parsed).id : LP.Generic;
}

/** Compact label for a URL (Linear `ABC-123`, GitHub `o/r#123`, generic hostname, …). */
export function shortLabelFor(url: string): string {
  const parsed = safeUrl(url);
  return parsed ? providerFor(parsed).shortLabel(parsed) : url;
}

/** Only http(s) URLs are safe to store and render in an href (blocks javascript:, data:, etc.). */
export function isSafeHttpUrl(url: string): boolean {
  const parsed = safeUrl(url);
  return parsed !== null && (parsed.protocol === "https:" || parsed.protocol === "http:");
}

/**
 * SSRF guard for the DESKTOP native unfurl path (Unit 5.2/5.3). Unlike the web
 * path — where the server's `/api/unfurl` resolves DNS and blocks internal
 * hosts — the Tauri webview fetches the URL directly from the user's machine,
 * so a crafted link could probe loopback/LAN services. Since the webview can't
 * resolve DNS, this is a syntactic pre-filter: require HTTPS and reject
 * localhost, `*.local`, bare single-label hosts, and literal private / loopback
 * / link-local IPs. (Does not defend DNS-rebinding — an accepted, documented
 * residual risk for desktop link unfurling.)
 */
export function isPublicHttpUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed || parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // Bare single-label hostnames (no dot) resolve to internal names — reject.
  if (!host.includes(".") && !host.includes(":")) return false;

  // IPv4 literal → block loopback / private / link-local / unspecified ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // multicast / reserved
  }
  // IPv6 loopback / unspecified / unique-local / link-local literals.
  if (
    host === "::1" ||
    host === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    host.startsWith("fe80:")
  )
    return false;

  return true;
}

/** Canonical form for de-duplication: lowercase origin, no trailing slash, no hash. */
export function normalizeUrl(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return url.trim();
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
