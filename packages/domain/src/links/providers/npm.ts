import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Package pages: `/package/<name>` (`<name>` may be scoped, e.g. `@org/pkg`). */
export const npm: LinkProviderDef = {
  id: LinkProvider.Npm,
  match: (u) => u.hostname === "npmjs.com" || u.hostname.endsWith(".npmjs.com"),
  shortLabel: (u) => {
    const name = /\/package\/(.+)/.exec(u.pathname)?.[1];
    return name ? decodeURIComponent(name) : "npm";
  },
};
