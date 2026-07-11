"use client";

import type { CardLink } from "@boardly/domain";
import { shortLabelFor } from "@boardly/domain";

import { ProviderIcon } from "./provider-icon";

/** Show at most this many link icons on the card face; the rest fold into `+N`. */
const MAX_VISIBLE = 5;

/**
 * Card-face link presentation: the first {@link MAX_VISIBLE} links as a row of
 * overlapping provider icons (in `link.ord` order), plus a `+N` overflow chip
 * when there are more. The full, reorderable list lives in the card drawer.
 */
export function LinkCluster({ links }: { links: CardLink[] }) {
  if (links.length === 0) return null;
  const visible = links.slice(0, MAX_VISIBLE);
  const overflow = links.length - visible.length;

  return (
    <span
      className="inline-flex items-center"
      aria-label={`${links.length} link${links.length === 1 ? "" : "s"}`}
    >
      {visible.map((link, i) => (
        <span
          key={link.id}
          data-link-icon
          title={link.title ?? shortLabelFor(link.url)}
          // Earlier icons sit on top so the stack reads left-to-right; each
          // subsequent icon tucks behind the previous one.
          style={{ zIndex: visible.length - i }}
          className={`relative grid size-[18px] place-items-center rounded-full bg-overlay ring-1 ring-elevated${
            i > 0 ? " -ml-1.5" : ""
          }`}
        >
          <ProviderIcon provider={link.provider} />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="relative z-0 -ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-overlay px-1 text-[10px] font-medium tabular-nums text-fg-muted ring-1 ring-elevated">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
