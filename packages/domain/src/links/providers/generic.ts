import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Catch-all — always matches, so it must be registered last. */
export const generic: LinkProviderDef = {
  id: LinkProvider.Generic,
  match: () => true,
  shortLabel: (u) => u.hostname.replace(/^www\./, ""),
};
