import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

const MR_RE = /^\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/;

export const gitlabMr: LinkProviderDef = {
  id: LinkProvider.GitLab,
  match: (u) => u.hostname === "gitlab.com" && MR_RE.test(u.pathname),
  shortLabel: (u) => {
    const m = MR_RE.exec(u.pathname);
    return m ? `${m[1]}/${m[2]}!${m[3]}` : "GitLab";
  },
};
