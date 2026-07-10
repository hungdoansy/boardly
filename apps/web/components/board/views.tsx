"use client";

import {
  type Filter,
  type GroupByField,
  type SavedView,
  type Sort,
  type SortField,
  type ViewLayout,
  isEmptyFilter,
  PRESET_VIEWS,
} from "@boardly/domain";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { ArrowDownUp, ArrowDown, ArrowUp, Check, Layers, ListFilter, Trash2 } from "lucide-react";
import { useState } from "react";

import { useLabels } from "../../lib/use-board";
import { useSavedViews, useViewActions } from "../../lib/use-views";
import { FilterBuilder } from "./filter-builder";

export interface ActiveView {
  filter: Filter;
  view: SavedView | null;
  groupBy: GroupByField | null;
  /** Sort applied by both lenses; null → board/input order (V1.1; UI in V1.4). */
  sort: Sort | null;
  /** Board vs list rendering (V1.1; toolbar switch in V1.4). */
  layout: ViewLayout;
}

const GROUP_OPTIONS: { value: GroupByField | null; label: string }[] = [
  { value: null, label: "None" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "severity", label: "Severity" },
  { value: "label", label: "Label" },
  { value: "assignee", label: "Assignee" },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "status", label: "Status" },
  { value: "title", label: "Title" },
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
];

/** Toolbar menu: group cards into swimlanes (board) / sections (list). */
export function GroupMenu({
  groupBy,
  onChange,
}: {
  groupBy: GroupByField | null;
  onChange: (groupBy: GroupByField | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = GROUP_OPTIONS.find((o) => o.value === groupBy);
  const active = groupBy !== null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Group by"
          className={active ? "text-fg" : "text-fg-muted"}
        >
          <Layers className="size-3.5" />
          {active ? current?.label : "Group"}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Group by menu" align="end" className="flex w-44 flex-col gap-0.5">
        {GROUP_OPTIONS.map((opt) => (
          <MenuRow
            key={opt.value ?? "none"}
            label={opt.label}
            selected={groupBy === opt.value}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Toolbar menu: field + direction sort (applied by the list; board stays ord-ordered). */
export function SortMenu({
  sort,
  onChange,
}: {
  sort: Sort | null;
  onChange: (sort: Sort | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === sort?.field);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sort"
          className={sort ? "text-fg" : "text-fg-muted"}
        >
          <ArrowDownUp className="size-3.5" />
          {sort ? current?.label : "Sort"}
          {sort ? (
            sort.direction === "asc" ? (
              <ArrowUp className="size-3 text-fg-faint" />
            ) : (
              <ArrowDown className="size-3 text-fg-faint" />
            )
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Sort menu" align="end" className="flex w-44 flex-col gap-0.5">
        <MenuRow
          label="No sorting"
          selected={!sort}
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        />
        <div className="my-0.5 border-t border-line-subtle" />
        {SORT_OPTIONS.map((opt) => (
          <MenuRow
            key={opt.value}
            label={opt.label}
            selected={sort?.field === opt.value}
            onClick={() => {
              onChange({ field: opt.value, direction: sort?.direction ?? "asc" });
              setOpen(false);
            }}
          />
        ))}
        {sort ? (
          <>
            <div className="my-0.5 border-t border-line-subtle" />
            <div className="flex gap-1 px-1 pt-0.5">
              {(["asc", "desc"] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-pressed={sort.direction === dir}
                  onClick={() => onChange({ field: sort.field, direction: dir })}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    sort.direction === dir
                      ? "bg-overlay text-fg"
                      : "text-fg-muted hover:bg-overlay/60"
                  }`}
                >
                  {dir === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  )}
                  {dir === "asc" ? "Asc" : "Desc"}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MenuRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        selected ? "text-fg" : "text-fg-muted"
      }`}
    >
      <Check
        className={selected ? "size-3 text-[var(--accent)]" : "size-3 text-transparent"}
        aria-hidden
      />
      {label}
    </button>
  );
}

export function ViewsMenu({
  boardId,
  active,
  onChange,
}: {
  boardId: string;
  active: ActiveView;
  onChange: (next: ActiveView) => void;
}) {
  const saved = useSavedViews(boardId);
  const actions = useViewActions(boardId);
  const labels = useLabels(boardId);
  const [name, setName] = useState("");

  // Applying a saved view restores its full lens (filter + sort + group + layout).
  const applyView = (view: SavedView): void =>
    onChange({
      filter: view.filter,
      view,
      groupBy: view.groupBy ?? null,
      sort: view.sort ?? null,
      layout: view.layout ?? "board",
    });
  const setFilter = (filter: Filter): void => onChange({ ...active, filter, view: null });
  const filtered = !isEmptyFilter(active.filter);
  // "Customized" = any lens dimension differs from the board default.
  const customized =
    filtered || active.groupBy !== null || active.sort !== null || active.layout !== "board";

  const saveCurrent = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: trimmed,
      filter: active.filter,
      groupBy: active.groupBy,
      sort: active.sort ?? undefined,
      layout: active.layout,
    };
    actions.save(view);
    setName("");
    onChange({
      filter: view.filter,
      view,
      groupBy: view.groupBy ?? null,
      sort: view.sort ?? null,
      layout: view.layout ?? "board",
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Views and filters"
          className={customized ? "text-fg" : "text-fg-muted"}
        >
          <ListFilter className="size-3.5" />
          {active.view ? active.view.name : filtered ? "Filtered" : "Filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Views menu" align="end" className="flex w-96 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
            Views
          </span>
          <div className="flex flex-wrap gap-1">
            {[...PRESET_VIEWS, ...saved].map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => applyView(view)}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  active.view?.id === view.id ? "bg-overlay text-fg" : "text-fg-muted"
                }`}
              >
                {active.view?.id === view.id ? (
                  <Check className="size-3 text-[var(--accent)]" />
                ) : null}
                {view.name}
                {view.id.startsWith("preset:") ? null : (
                  <Trash2
                    className="size-3 text-fg-faint hover:text-[var(--danger)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.remove(view.id);
                      if (active.view?.id === view.id) onChange({ ...active, view: null });
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line-subtle pt-2">
          <FilterBuilder labels={labels} filter={active.filter} onChange={setFilter} />
        </div>

        <div className="flex items-center gap-2 border-t border-line-subtle pt-2">
          <input
            aria-label="View name"
            placeholder="Save current as view…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrent();
            }}
            className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-elevated px-2 text-sm text-fg outline-none placeholder:text-fg-faint focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <Button size="sm" onClick={saveCurrent} disabled={!name.trim() || !customized}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
