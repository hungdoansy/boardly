import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

export const slack: LinkProviderDef = {
  id: LinkProvider.Slack,
  match: (u) => u.hostname === "slack.com" || u.hostname.endsWith(".slack.com"),
  shortLabel: (u) => (u.pathname.includes("/archives/") ? "msg →" : "Slack"),
};
