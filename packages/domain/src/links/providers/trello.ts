import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Trello card URLs end in `<short-id>/<n>-card-title`; drop the leading number. */
export const trello: LinkProviderDef = {
  id: LinkProvider.Trello,
  match: (u) => u.hostname === "trello.com" || u.hostname.endsWith(".trello.com"),
  shortLabel: (u) => {
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (!last) return "Trello";
    const title = last.replace(/^\d+-/, "").replace(/-/g, " ");
    return title || "Trello";
  },
};
