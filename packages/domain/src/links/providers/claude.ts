import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

export const claude: LinkProviderDef = {
  id: LinkProvider.Claude,
  match: (u) => u.hostname === "claude.ai" || u.hostname.endsWith(".claude.ai"),
  shortLabel: () => "session →",
};
