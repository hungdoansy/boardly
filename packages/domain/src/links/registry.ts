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

/** Canonical form for de-duplication: lowercase origin, no trailing slash, no hash. */
export function normalizeUrl(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return url.trim();
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
