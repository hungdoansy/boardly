import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

const ISSUE_RE = /^\/([^/]+)\/([^/]+)\/-\/issues\/(\d+)/;

export const gitlabIssue: LinkProviderDef = {
  id: LinkProvider.GitLab,
  match: (u) => u.hostname === "gitlab.com" && ISSUE_RE.test(u.pathname),
  shortLabel: (u) => {
    const m = ISSUE_RE.exec(u.pathname);
    return m ? `${m[1]}/${m[2]}#${m[3]}` : "GitLab";
  },
};
