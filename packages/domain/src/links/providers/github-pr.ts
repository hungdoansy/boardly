import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

const PR_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export const githubPr: LinkProviderDef = {
  id: LinkProvider.GitHub,
  match: (u) => u.hostname === "github.com" && PR_RE.test(u.pathname),
  shortLabel: (u) => {
    const m = PR_RE.exec(u.pathname);
    return m ? `${m[1]}/${m[2]}#${m[3]}` : "GitHub";
  },
};
