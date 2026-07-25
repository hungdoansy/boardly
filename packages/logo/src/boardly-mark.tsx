"use client";

import { useId } from "react";

import { MARK_SVG } from "./mark-svg";
import { scopeSvgIds } from "./scope-svg-ids";

/**
 * The Boardly brand mark, rendered inline (no network request, crisp at any
 * DPI, no flash). Mirrors the web app's provider-icon pattern: the mark markup
 * is injected verbatim and its internal gradient ids are scoped to this render
 * instance so multiple marks on one page never collide.
 *
 * `MARK_SVG` is fixed package data (never user input), so `dangerouslySetInnerHTML`
 * is safe here. The mark carries `width`/`height` presentation attributes; the
 * wrapper's `size-full` CSS overrides them so `className` (or the `size-6`
 * default) fully controls the rendered size.
 */
export function BoardlyMark({ className }: { className?: string }) {
  const scopeId = useId().replace(/:/g, "");
  const sizing = className ?? "size-6";
  return (
    <span
      aria-hidden="true"
      data-boardly-mark=""
      className={`inline-block align-middle [&_svg]:block [&_svg]:size-full ${sizing}`}
      dangerouslySetInnerHTML={{ __html: scopeSvgIds(MARK_SVG, scopeId) }}
    />
  );
}
