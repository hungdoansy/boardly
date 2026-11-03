import type { LinkProvider } from "../../enums";
import type { LinkProviderDef } from "../registry";

/** True if the URL's hostname is (or is a subdomain of) any of `hosts`. */
export function matchesHost(u: URL, ...hosts: string[]): boolean {
  return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

/**
 * A provider whose URLs never carry a readable title (a meeting/board/file
 * id, not a slug) — the chip just names the brand. `labelIsBrandOnly` marks
 * that, so these links still get a page-title unfurl (see `wantsUnfurl`);
 * without it the chip can only ever read `label`.
 */
export function staticProvider(id: LinkProvider, hosts: string[], label: string): LinkProviderDef {
  return {
    id,
    match: (u) => matchesHost(u, ...hosts),
    shortLabel: () => label,
    labelIsBrandOnly: true,
  };
}
