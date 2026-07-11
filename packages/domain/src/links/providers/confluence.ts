import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Confluence Cloud pages live at `<workspace>.atlassian.net/wiki/*`. */
export const confluence: LinkProviderDef = {
  id: LinkProvider.Confluence,
  match: (u) => u.hostname.endsWith(".atlassian.net") && u.pathname.startsWith("/wiki"),
  shortLabel: () => "Confluence",
};
