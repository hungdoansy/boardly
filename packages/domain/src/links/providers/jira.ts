import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

const ISSUE_RE = /([A-Z][A-Z0-9]+-\d+)/;

/** Jira Cloud issues live at `<workspace>.atlassian.net/browse/ABC-123`; `/wiki/*` is Confluence. */
export const jira: LinkProviderDef = {
  id: LinkProvider.Jira,
  match: (u) => u.hostname.endsWith(".atlassian.net") && !u.pathname.startsWith("/wiki"),
  shortLabel: (u) => ISSUE_RE.exec(u.pathname)?.[1] ?? "Jira",
};
