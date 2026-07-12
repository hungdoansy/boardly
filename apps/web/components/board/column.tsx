"use client";

import { type Status, STATUS_META } from "@boardly/domain";
import { StatusIcon } from "@boardly/ui";
import { type CSSProperties, type ReactNode } from "react";

interface BoardColumnProps {
  status: Status;
  count: number;
  children?: ReactNode;
  dndRef?: (el: HTMLElement | null) => void;
  dndStyle?: CSSProperties;
}

/**
 * A fixed Linear-style status column. Columns are derived from the domain
 * `STATUS_ORDER` and cannot be added, renamed, reordered, or WIP-limited — the
 * header is a read-only status name + color swatch. The header stays a focusable
 * `data-nav="column"` target so keyboard navigation still lands on columns.
 */
export function BoardColumn({ status, count, children, dndRef, dndStyle }: BoardColumnProps) {
  const meta = STATUS_META[status];
  return (
    <section
      ref={dndRef}
      style={dndStyle}
      data-nav-column={status}
      aria-label={`Column: ${meta.name}`}
      className="flex max-h-full w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border border-line-subtle bg-surface"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 px-2">
        <button
          type="button"
          data-nav="column"
          data-column-id={status}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <StatusIcon variant={status} color={meta.color} className="shrink-0" />
          <span className="min-w-0 truncate text-md font-medium text-fg">{meta.name}</span>
        </button>
        <span className="px-1 text-xs tabular-nums text-fg-faint">{count}</span>
      </header>

      <div className="flex min-h-9 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {children}
      </div>
    </section>
  );
}
