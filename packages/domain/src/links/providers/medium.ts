import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Medium article URLs end in `article-title-<12-hex-char-id>`; strip the id. */
const TRAILING_ID_RE = /-[0-9a-f]{12}$/i;

export const medium: LinkProviderDef = {
  id: LinkProvider.Medium,
  match: (u) => u.hostname === "medium.com" || u.hostname.endsWith(".medium.com"),
  shortLabel: (u) => {
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last || last.startsWith("@")) return "Medium";
    const title = last.replace(TRAILING_ID_RE, "").replace(/-/g, " ");
    return title || "Medium";
  },
};
