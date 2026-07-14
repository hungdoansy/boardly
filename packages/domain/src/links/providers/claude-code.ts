import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

// A Claude Code CLI session is pasted as a terminal command, not a URL. We
// canonicalize it to a custom-scheme URL (`claude-code://resume/<id>`) so it
// flows through the normal link pipeline (detect/store/label), but the chip is
// rendered as a copy-to-clipboard button (there is no page to open).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// `claude --resume <id>`, `claude -r <id>`, or `claude --resume=<id>`.
const RESUME_CMD_RE = /^claude\s+(?:--resume|-r)(?:\s+|=)(\S+)$/i;

/** Session id from a pasted resume command, or null if the text isn't one. */
export function parseClaudeResume(text: string): string | null {
  const id = RESUME_CMD_RE.exec(text.trim())?.[1];
  return id && UUID_RE.test(id) ? id.toLowerCase() : null;
}

/** Canonical stored URL for a session (custom scheme — not http). */
export function formatClaudeResumeUrl(sessionId: string): string {
  return `claude-code://resume/${sessionId}`;
}

/** The terminal command that resumes the session (what clicking the chip copies). */
export function claudeResumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

/** Session id from a stored `claude-code://resume/<id>` URL, or null. */
export function parseClaudeResumeUrl(url: string): string | null {
  const id = /^claude-code:\/\/resume\/([^/?#]+)\/?$/i.exec(url.trim())?.[1];
  return id && UUID_RE.test(id) ? id.toLowerCase() : null;
}

/** True for a well-formed Claude Code session URL (used to allow it past the http-only gate). */
export function isClaudeCodeUrl(url: string): boolean {
  return parseClaudeResumeUrl(url) !== null;
}

export const claudeCode: LinkProviderDef = {
  id: LinkProvider.ClaudeCode,
  match: (u) => u.protocol === "claude-code:",
  shortLabel: (u) => {
    const id = parseClaudeResumeUrl(u.href);
    return id ? `Claude session ${id.slice(0, 8)}` : "Claude session";
  },
};
