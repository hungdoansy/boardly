import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Notion page URLs end in `My-Page-Title-<32-hex-char-id>`; strip the id. */
const TRAILING_ID_RE = /-[0-9a-f]{32}$/i;

export const notion: LinkProviderDef = {
  id: LinkProvider.Notion,
  match: (u) =>
    u.hostname === "notion.so" ||
    u.hostname.endsWith(".notion.so") ||
    u.hostname === "notion.site" ||
    u.hostname.endsWith(".notion.site"),
  shortLabel: (u) => {
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last) return "Notion";
    const title = last.replace(TRAILING_ID_RE, "").replace(/-/g, " ");
    return title || "Notion";
  },
};
