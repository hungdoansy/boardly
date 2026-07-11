import type { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** True if the URL's hostname is (or is a subdomain of) any of `hosts`. */
export function matchesHost(u: URL, ...hosts: string[]): boolean {
  return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

/**
 * A provider whose URLs never carry a readable title (a meeting/board/file
 * id, not a slug) — the chip just names the brand.
 */
export function staticProvider(id: LinkProvider, hosts: string[], label: string): LinkProviderDef {
  return { id, match: (u) => matchesHost(u, ...hosts), shortLabel: () => label };
}
