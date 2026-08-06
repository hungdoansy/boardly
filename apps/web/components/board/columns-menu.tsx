"use client";

import { type Filter, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  StatusIcon,
} from "@boardly/ui";
import { Columns3Cog } from "lucide-react";

import { setColumnHidden, showAllColumns, useHiddenStatuses } from "../../lib/hidden-columns";
import { useSetShowEmptyColumns, useShowEmptyColumns } from "../../lib/use-board";
import { useStatusCounts } from "../../lib/use-status-counts";

/**
 * The header toolbar's column-visibility control (UNIT-18). One menu owns both
 * visibility rules: a checkbox per status (checked = visible) and the synced
 * `showEmptyColumns` toggle that used to be a standalone toolbar button.
 *
 * A hidden column's cards are not archived or filtered — they simply are not
 * laid out. So every row carries its live, filter-aware count, and the trigger
 * advertises how many columns are hidden: that is the whole discovery story for
 * a card that lands in a hidden column. The counts come from the same hook the
 * board's columns use, so the two can't drift even though they no longer share
 * a parent.
 *
 * The checkbox rows `preventDefault()` their select because Radix closes the
 * menu on select, and hiding three columns should not mean opening the menu
 * three times. `Show all columns` is a plain item and *does* close — it is a
 * one-shot reset with nothing left to toggle.
 */
export function ColumnsMenu({ filter }: { filter?: Filter }) {
  const counts = useStatusCounts(filter);
  const hidden = useHiddenStatuses();
  const showEmptyColumns = useShowEmptyColumns();
  const setShowEmptyColumns = useSetShowEmptyColumns();

  const hiddenCount = hidden.length;
  const label = hiddenCount > 0 ? `Columns · ${hiddenCount} hidden` : "Columns";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={hiddenCount > 0 ? `Columns, ${hiddenCount} hidden` : "Columns"}
          className={hiddenCount > 0 ? "text-fg" : "text-fg-muted"}
        >
          {/* Not plain `Columns3` — that is the layout switch's Board icon, which
              now sits immediately to the left. The cog says "column settings". */}
          <Columns3Cog className="size-3.5" aria-hidden="true" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {STATUS_ORDER.map((status) => {
          const visible = !hidden.includes(status);
          return (
            <DropdownMenuCheckboxItem
              key={status}
              checked={visible}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(next) => setColumnHidden(status, !next)}
            >
              <StatusIcon variant={status} color={STATUS_META[status].color} className="shrink-0" />
              <span className="min-w-0 truncate">{STATUS_META[status].name}</span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-faint">
                {counts[status] ?? 0}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showEmptyColumns}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(next) => setShowEmptyColumns(next)}
        >
          Show empty columns
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem disabled={hiddenCount === 0} onSelect={() => showAllColumns()}>
          Show all columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
