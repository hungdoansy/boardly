import { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** X (formerly Twitter); the first path segment is the author's handle. */
const RESERVED = new Set(["i", "intent", "home", "explore", "notifications", "messages", "search"]);

export const twitter: LinkProviderDef = {
  id: LinkProvider.Twitter,
  match: (u) =>
    u.hostname === "twitter.com" ||
    u.hostname.endsWith(".twitter.com") ||
    u.hostname === "x.com" ||
    u.hostname.endsWith(".x.com"),
  shortLabel: (u) => {
    const handle = u.pathname.split("/").filter(Boolean)[0];
    return handle && !RESERVED.has(handle.toLowerCase()) ? `@${handle}` : "X";
  },
};
