// Extensible link-provider registry — the single source of truth for provider
// detection + short labels, used by both the card link chips (UI) and the
// command layer. Adding a provider with a readable title/slug in its URLs =
// one file in ./providers + one entry here; a provider whose URLs never carry
// a readable title (just a brand + an opaque id) = one `staticProvider(...)`
// entry below, no new file needed.
import { LinkProvider as LP } from "../enums";
import type { LinkProvider } from "../enums";
import { claude } from "./providers/claude";
import { confluence } from "./providers/confluence";
import { figma } from "./providers/figma";
import { generic } from "./providers/generic";
import { githubIssue } from "./providers/github-issue";
import { githubPr } from "./providers/github-pr";
import { githubRepo, isGithubRepoUrl } from "./providers/github-repo";
import { gitlabIssue } from "./providers/gitlab-issue";
import { gitlabMr } from "./providers/gitlab-mr";
import { jira } from "./providers/jira";
import { linear } from "./providers/linear";
import { medium } from "./providers/medium";
import { notion } from "./providers/notion";
import { npm } from "./providers/npm";
import { reddit } from "./providers/reddit";
import { slack } from "./providers/slack";
import { stackoverflow } from "./providers/stackoverflow";
import { staticProvider } from "./providers/static-provider";
import { trello } from "./providers/trello";
import { twitter } from "./providers/twitter";
import { wikipedia } from "./providers/wikipedia";

export { isGithubRepoUrl };

export interface LinkProviderDef {
  id: LinkProvider;
  /** True if this provider handles the (already-parsed) URL. */
  match(url: URL): boolean;
  /** Compact, scannable chip label. */
  shortLabel(url: URL): string;
}

/** Ordered; `generic` is last so it never shadows a specific provider. */
export const PROVIDERS: LinkProviderDef[] = [
  slack,
  linear,
  githubPr,
  githubIssue,
  githubRepo,
  claude,
  figma,
  notion,
  trello,
  jira,
  confluence,
  gitlabMr,
  gitlabIssue,
  twitter,
  reddit,
  medium,
  stackoverflow,
  npm,
  wikipedia,
  staticProvider(LP.GoogleDocs, ["docs.google.com"], "Google Doc"),
  staticProvider(LP.GoogleSheets, ["sheets.google.com"], "Google Sheet"),
  staticProvider(LP.GoogleDrive, ["drive.google.com"], "Google Drive"),
  staticProvider(LP.GoogleCalendar, ["calendar.google.com"], "Google Calendar"),
  staticProvider(LP.Loom, ["loom.com"], "Loom"),
  staticProvider(LP.Miro, ["miro.com"], "Miro"),
  staticProvider(LP.Dropbox, ["dropbox.com"], "Dropbox"),
  staticProvider(LP.YouTube, ["youtube.com", "youtu.be"], "YouTube"),
  staticProvider(LP.Zoom, ["zoom.us"], "Zoom"),
  staticProvider(LP.Asana, ["asana.com"], "Asana"),
  staticProvider(LP.Airtable, ["airtable.com"], "Airtable"),
  staticProvider(LP.Facebook, ["facebook.com", "fb.com"], "Facebook"),
  staticProvider(LP.Instagram, ["instagram.com"], "Instagram"),
  staticProvider(LP.LinkedIn, ["linkedin.com"], "LinkedIn"),
  staticProvider(LP.Discord, ["discord.com", "discord.gg"], "Discord"),
  staticProvider(LP.TikTok, ["tiktok.com"], "TikTok"),
  staticProvider(LP.Pinterest, ["pinterest.com"], "Pinterest"),
  staticProvider(LP.WhatsApp, ["whatsapp.com", "wa.me"], "WhatsApp"),
  staticProvider(LP.Telegram, ["telegram.org", "t.me"], "Telegram"),
  staticProvider(LP.GitLab, ["gitlab.com"], "GitLab"),
  staticProvider(LP.Bitbucket, ["bitbucket.org"], "Bitbucket"),
  staticProvider(LP.DockerHub, ["hub.docker.com"], "Docker Hub"),
  staticProvider(LP.Spotify, ["open.spotify.com"], "Spotify"),
  staticProvider(LP.Twitch, ["twitch.tv"], "Twitch"),
  staticProvider(LP.Vimeo, ["vimeo.com"], "Vimeo"),
  staticProvider(LP.Behance, ["behance.net"], "Behance"),
  staticProvider(LP.Dribbble, ["dribbble.com"], "Dribbble"),
  staticProvider(LP.CodePen, ["codepen.io"], "CodePen"),
  staticProvider(LP.Replit, ["replit.com"], "Replit"),
  staticProvider(LP.GoogleMeet, ["meet.google.com"], "Google Meet"),
  staticProvider(LP.Stripe, ["stripe.com"], "Stripe"),
  generic,
];

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

/**
 * Display label for a link chip. Every provider except GitHub uses a fetched
 * `title` when present, falling back to `shortLabel`. GitHub always shows the
 * repo/PR/issue path — a fetched repo description (also stored in `title`,
 * see `use-board.ts`) is a secondary line, not a label replacement; use
 * {@link linkSubtitle} to read it.
 */
export function linkLabel(link: { provider: LinkProvider; url: string; title?: string }): string {
  return link.provider === LP.GitHub ? shortLabelFor(link.url) : (link.title ?? shortLabelFor(link.url));
}

/** Secondary descriptive text under the label, when present (GitHub repo descriptions only, for now). */
export function linkSubtitle(link: { provider: LinkProvider; title?: string }): string | undefined {
  return link.provider === LP.GitHub ? link.title : undefined;
}

/** Trailing marker a `shortLabel` uses to flag a deep link (Slack thread, Claude session, …). */
const DEEP_LINK_MARKER = " →";

/**
 * Strip the deep-link marker some `shortLabel`s append, so callers can render
 * an SVG affordance (e.g. lucide's `ArrowUpRight`) instead of printing the
 * glyph (DESIGN.md §7.1). Single source of truth — every renderer of a
 * provider short label calls this instead of re-deriving deep-link-ness.
 */
export function stripDeepLinkMarker(label: string): { label: string; isDeepLink: boolean } {
  if (!label.endsWith(DEEP_LINK_MARKER)) return { label, isDeepLink: false };
  return { label: label.slice(0, -DEEP_LINK_MARKER.length), isDeepLink: true };
}

/** Only http(s) URLs are safe to store and render in an href (blocks javascript:, data:, etc.). */
export function isSafeHttpUrl(url: string): boolean {
  const parsed = safeUrl(url);
  return parsed !== null && (parsed.protocol === "https:" || parsed.protocol === "http:");
}

/** IPv4 in a non-public range: unspecified / private / loopback / link-local / multicast. */
function isPrivateV4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved
  );
}

/**
 * SSRF guard for the DESKTOP native unfurl path (Unit 5.2/5.3). Unlike the web
 * path — where the server's `/api/unfurl` resolves DNS and blocks internal
 * hosts — the Tauri webview fetches the URL directly from the user's machine,
 * so a crafted link could probe loopback/LAN services. Since the webview can't
 * resolve DNS, this is a syntactic pre-filter: require HTTPS and reject
 * localhost, `*.local`, bare single-label hosts, and literal private / loopback
 * / link-local IPs (v4 and v6, including IPv4-mapped/NAT64/6to4 forms). Does
 * not defend DNS-rebinding — an accepted, documented residual for desktop
 * unfurling.
 */
export function isPublicHttpUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed || parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // Bare single-label hostnames (no dot) resolve to internal names — reject.
  if (!host.includes(".") && !host.includes(":")) return false;

  // IPv4 literal → block non-public ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4 && isPrivateV4(Number(v4[1]), Number(v4[2]))) return false;

  if (host.includes(":")) {
    // Unspecified / loopback / unique-local (fc00::/7) / link-local (fe80::/10).
    if (host === "::" || host === "::1") return false;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return false;
    if (host.startsWith("fe80:")) return false;
    // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) embed an IPv4 that may be private.
    if (host.startsWith("64:ff9b:") || host.startsWith("2002:")) return false;
    // IPv4-mapped/compatible (`::ffff:…` / `::…`) embed an IPv4. The WHATWG URL
    // parser canonicalizes the dotted quad to hex, so public vs private can't be
    // told apart syntactically — deny all such forms (legit browsing never uses
    // them). `::`/`::1` are already handled above.
    if (host.startsWith("::")) return false;
    // Any other IPv6 still carrying a dotted quad → apply the v4 ranges.
    const embedded = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (embedded && isPrivateV4(Number(embedded[1]), Number(embedded[2]))) return false;
  }

  return true;
}

/** Canonical form for de-duplication: lowercase origin, no trailing slash, no hash. */
export function normalizeUrl(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return url.trim();
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
