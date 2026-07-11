import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Figma file/design URLs end in a human slug: `/file/<id>/My-Design-Name`. */
export const figma: LinkProviderDef = {
  id: LinkProvider.Figma,
  match: (u) => u.hostname === "figma.com" || u.hostname.endsWith(".figma.com"),
  shortLabel: (u) => {
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? last.replace(/-/g, " ") : "Figma";
  },
};
