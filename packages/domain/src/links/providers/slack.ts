import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** Title-case a workspace subdomain label: "moonbase" → "Moonbase". */
function titleCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const slack: LinkProviderDef = {
  id: LinkProvider.Slack,
  match: (u) => u.hostname === "slack.com" || u.hostname.endsWith(".slack.com"),
  // Slack messages can't be unfurled, so show the WORKSPACE name (from the
  // subdomain) rather than a generic "msg". No deep-link " →" marker either, so
  // the link renders without the external-link arrow (UNIT-9.8). The enterprise
  // host (`slack.com`) and the `app`/`www` subdomains carry no workspace name →
  // the generic "Slack" label.
  shortLabel: (u) => {
    const host = u.hostname.toLowerCase();
    const sub = host.endsWith(".slack.com") ? host.slice(0, -".slack.com".length) : "";
    const workspace = sub.split(".")[0] ?? "";
    if (!workspace || workspace === "app" || workspace === "www") return "Slack";
    return titleCase(workspace);
  },
};
