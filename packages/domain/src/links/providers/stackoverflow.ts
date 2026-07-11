import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Question URLs: `/questions/<id>/<title-slug>`. */
const QUESTION_RE = /\/questions\/\d+\/([^/]+)/;

export const stackoverflow: LinkProviderDef = {
  id: LinkProvider.StackOverflow,
  match: (u) => u.hostname === "stackoverflow.com" || u.hostname.endsWith(".stackoverflow.com"),
  shortLabel: (u) => {
    const title = QUESTION_RE.exec(u.pathname)?.[1];
    return title ? title.replace(/-/g, " ") : "Stack Overflow";
  },
};
