import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

const ISSUE_RE = /([A-Z][A-Z0-9]+-\d+)/;

export const linear: LinkProviderDef = {
  id: LinkProvider.Linear,
  match: (u) => u.hostname === "linear.app" || u.hostname.endsWith(".linear.app"),
  shortLabel: (u) => ISSUE_RE.exec(u.pathname)?.[1] ?? "Linear",
};
