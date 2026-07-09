// URL → provider detection and short-label formatting. Framework-agnostic and
// used by both the card link chips (UI) and the command layer. The richer
// provider registry (bundled icons, GitHub PR/issue, one-file extensibility)
// is built on top of this in Unit 2.7.
import { LinkProvider } from "./enums";

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Detect the provider for a URL. Malformed/relative URLs fall back to
 * `generic` without throwing.
 */
export function detectProvider(url: string): LinkProvider {
  const parsed = safeUrl(url);
  if (!parsed) return LinkProvider.Generic;
  const host = parsed.hostname.toLowerCase();
  if (host === "slack.com" || host.endsWith(".slack.com")) return LinkProvider.Slack;
  if (host === "linear.app" || host.endsWith(".linear.app")) return LinkProvider.Linear;
  if (host === "claude.ai" || host.endsWith(".claude.ai")) return LinkProvider.Claude;
  return LinkProvider.Generic;
}

const LINEAR_ISSUE_RE = /([A-Z][A-Z0-9]+-\d+)/;

/**
 * A compact, scannable label for a link chip. Linear → `ABC-123`,
 * Slack message → `msg →`, Claude session → `session →`, generic → hostname.
 */
export function shortLabelFor(url: string, provider: LinkProvider = detectProvider(url)): string {
  const parsed = safeUrl(url);
  switch (provider) {
    case LinkProvider.Linear: {
      const id = parsed ? LINEAR_ISSUE_RE.exec(parsed.pathname)?.[1] : undefined;
      return id ?? "Linear";
    }
    case LinkProvider.Slack:
      return parsed?.pathname.includes("/archives/") ? "msg →" : "Slack";
    case LinkProvider.Claude:
      return "session →";
    case LinkProvider.Generic:
    default:
      return parsed ? parsed.hostname.replace(/^www\./, "") : url;
  }
}
