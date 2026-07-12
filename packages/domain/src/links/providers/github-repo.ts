import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

// Bare repo URLs (`/owner/repo`) only. Registered after `githubPr`/`githubIssue`
// so those keep matching first; a short owner-name denylist keeps github.com's
// own two-segment top-level pages (settings, orgs/acme, …) from misreading as
// a repo.
const REPO_RE = /^\/([^/]+)\/([^/]+)\/?$/;
const NON_REPO_OWNERS = new Set([
  "settings",
  "notifications",
  "marketplace",
  "sponsors",
  "orgs",
  "apps",
  "topics",
  "trending",
  "collections",
  "codespaces",
  "explore",
  "search",
]);

function isRepoPath(u: URL): boolean {
  if (u.hostname !== "github.com") return false;
  const m = REPO_RE.exec(u.pathname);
  return m !== null && !NON_REPO_OWNERS.has(m[1] ?? "");
}

export const githubRepo: LinkProviderDef = {
  id: LinkProvider.GitHub,
  match: isRepoPath,
  shortLabel: (u) => {
    const m = REPO_RE.exec(u.pathname);
    return m ? `${m[1]}/${m[2]}` : "GitHub";
  },
};

/** Synchronous check used to gate the (async) repo-description fetch — see `use-board.ts`. */
export function isGithubRepoUrl(url: string): boolean {
  try {
    return isRepoPath(new URL(url));
  } catch {
    return false;
  }
}
