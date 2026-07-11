import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Article URLs: `/wiki/Article_Title`. */
export const wikipedia: LinkProviderDef = {
  id: LinkProvider.Wikipedia,
  match: (u) => u.hostname === "wikipedia.org" || u.hostname.endsWith(".wikipedia.org"),
  shortLabel: (u) => {
    const title = /\/wiki\/(.+)/.exec(u.pathname)?.[1];
    return title ? decodeURIComponent(title).replace(/_/g, " ") : "Wikipedia";
  },
};
