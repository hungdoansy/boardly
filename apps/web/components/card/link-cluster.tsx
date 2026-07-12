"use client";

import type { CardLink } from "@boardly/domain";
import { shortLabelFor, stripDeepLinkMarker } from "@boardly/domain";

import { CHIP } from "./chip";
import { ProviderIcon } from "./provider-icon";
import { cn } from "@boardly/ui";

/** Show at most this many link icons on the card face; the rest fold into `+N`. */
const MAX_VISIBLE = 5;

/**
 * Card-face link presentation: one badge (the shared `CHIP` shell, same as
 * every other card-face field) holding the first {@link MAX_VISIBLE} links as
 * overlapping provider icons (in `link.ord` order), plus a `+N` overflow
 * count when there are more. Only the outer shell is a badge — the icons
 * inside have no border of their own, just a solid backing circle so an
 * overlapping icon doesn't show through the one below it. The full,
 * reorderable list lives in the card drawer.
 */
export function LinkCluster({ links }: { links: CardLink[] }) {
  if (links.length === 0) return null;
  const visible = links.slice(0, MAX_VISIBLE);
  const overflow = links.length - visible.length;

  return (
    <span className={cn(CHIP, "pl-0.5 pr-1")} aria-label={`${links.length} link${links.length === 1 ? "" : "s"}`}>
      <span className="flex items-center">
        {visible.map((link, i) => (
          <span
            key={link.id}
            data-link-icon
            title={stripDeepLinkMarker(link.title ?? shortLabelFor(link.url)).label}
            // Earlier icons sit on top so the stack reads left-to-right; each
            // subsequent icon tucks behind the previous one.
            style={{ zIndex: visible.length - i }}
            className={`relative grid size-3.5 place-items-center rounded-full bg-overlay${
              i > 0 ? " -ml-1" : ""
            }`}
          >
            <ProviderIcon provider={link.provider} />
          </span>
        ))}
      </span>
      {overflow > 0 ? <span className="text-fg-muted">+{overflow}</span> : null}
    </span>
  );
}
