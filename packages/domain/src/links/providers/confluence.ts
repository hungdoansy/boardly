import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/**
 * Confluence Cloud pages live at `<workspace>.atlassian.net/wiki/*`. The page
 * title is in the URL, but only as a `+`-joined tail after the page id, so the
 * label stays brand-only and leans on the unfurl instead.
 */
export const confluence: LinkProviderDef = {
  id: LinkProvider.Confluence,
  match: (u) => u.hostname.endsWith(".atlassian.net") && u.pathname.startsWith("/wiki"),
  shortLabel: () => "Confluence",
  labelIsBrandOnly: true,
};
