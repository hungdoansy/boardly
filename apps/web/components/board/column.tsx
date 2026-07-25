"use client";

import { type Status, STATUS_META } from "@boardly/domain";
import { StatusIcon } from "@boardly/ui";
import { Plus } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";

interface BoardColumnProps {
  status: Status;
  count: number;
  children?: ReactNode;
  dndRef?: (el: HTMLElement | null) => void;
  dndStyle?: CSSProperties;
  /** True while a card drag is hovering this column (dnd-kit `isOver`). */
  isOver?: boolean;
  /** Opens the column's inline add-card composer; renders the header "+". */
  onAddCard?: () => void;
  /** The column's 3-dots actions menu, rendered at the header's right edge. */
  menu?: ReactNode;
}

/**
 * A fixed Linear-style status column. Columns are derived from the domain
 * `STATUS_ORDER` and cannot be added, renamed, reordered, or WIP-limited — the
 * header is a read-only status name + color swatch, the live count beside it,
 * and an add-card "+" pushed to the right. The header stays a focusable
 * `data-nav="column"` target so keyboard navigation still lands on columns.
 *
 * While a card drag hovers the column (`isOver`), it gains an accent ring; when
 * it is also empty, its body expands into a clear accent-tinted drop zone so a
 * collapsed column becomes an easy, visible drop target.
 */
export function BoardColumn({
  status,
  count,
  children,
  dndRef,
  dndStyle,
  isOver,
  onAddCard,
  menu,
}: BoardColumnProps) {
  const meta = STATUS_META[status];
  const empty = count === 0;
  return (
    <section
      ref={dndRef}
      style={dndStyle}
      data-nav-column={status}
      data-over={isOver ? "" : undefined}
      aria-label={`Column: ${meta.name}`}
      className={`flex max-h-full w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border bg-surface ${
        isOver ? "border-transparent ring-2 ring-[var(--accent)]" : "border-line-subtle"
      }`}
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            data-nav="column"
            data-column-id={status}
            className="flex min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <StatusIcon variant={status} color={meta.color} className="shrink-0" />
            <span className="min-w-0 truncate text-md font-medium text-fg">{meta.name}</span>
          </button>
          <span className="shrink-0 text-xs tabular-nums text-fg-faint">{count}</span>
        </div>
        {onAddCard ? (
          <button
            type="button"
            onClick={onAddCard}
            aria-label="Add card"
            title="Add card"
            className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
        {menu}
      </header>

      <div className="flex min-h-9 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {isOver && empty ? (
          <div
            data-drop-zone
            aria-hidden
            className="min-h-[76px] rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] bg-[var(--bg-selected)]"
          />
        ) : null}
        {children}
      </div>
    </section>
  );
}
