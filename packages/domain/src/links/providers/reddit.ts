import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Reddit post URLs: `/r/<subreddit>/comments/<id>/<title-slug>/`. */
const POST_RE = /\/r\/([^/]+)\/comments\/[^/]+\/([^/]+)/;

export const reddit: LinkProviderDef = {
  id: LinkProvider.Reddit,
  match: (u) => u.hostname === "reddit.com" || u.hostname.endsWith(".reddit.com"),
  shortLabel: (u) => {
    const title = POST_RE.exec(u.pathname)?.[2];
    if (title) return title.replace(/-/g, " ");
    const sub = /\/r\/([^/]+)/.exec(u.pathname)?.[1];
    return sub ? `r/${sub}` : "Reddit";
  },
};
