"use client";

import { EyeOff } from "lucide-react";

import type { SearchDoc } from "./search-index";

/**
 * Names the hidden project behind a revealed search result (UNIT-20, R7). Both
 * search surfaces render it, so the two can't drift apart on what "revealed"
 * looks like; it self-gates on `projectHidden` so the rule lives in one place
 * rather than at each call site.
 *
 * The glyph is `EyeOff` — here it reports a *state* (this project is hidden),
 * which is the same vocabulary the hide actions use, and the exact opposite of
 * the `Eye` on the control that reveals these rows. It is deliberately not
 * §7.3's project `Box`: that glyph is bound to the project's own color, which a
 * `SearchDoc` does not carry, and this row is marking hiddenness, not identity.
 */
export function HiddenProjectMarker({ doc }: { doc: SearchDoc }) {
  if (!doc.projectHidden) return null;
  return (
    <span className="ml-2 flex min-w-0 shrink items-center gap-1 text-xs text-fg-faint">
      <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
      {/* Only the project name is drawn; without this the distinction between a
          marked and an unmarked row would be carried by the glyph alone
          (DESIGN.md §9). */}
      <span className="sr-only">Hidden project</span>
      {doc.projectName === undefined ? null : <span className="truncate">{doc.projectName}</span>}
    </span>
  );
}
