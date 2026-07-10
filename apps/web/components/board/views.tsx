"use client";

import { type Filter, type SavedView, isEmptyFilter, PRESET_VIEWS } from "@boardly/domain";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Check, ListFilter, Trash2 } from "lucide-react";
import { useState } from "react";

import { useSavedViews, useViewActions } from "../../lib/use-views";
import { FilterBuilder } from "./filter-builder";

export interface ActiveView {
  filter: Filter;
  view: SavedView | null;
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
  const [name, setName] = useState("");

  const applyView = (view: SavedView): void => onChange({ filter: view.filter, view });
  const setFilter = (filter: Filter): void => onChange({ filter, view: null });
  const filtered = !isEmptyFilter(active.filter);

  const saveCurrent = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: trimmed,
      filter: active.filter,
    };
    actions.save(view);
    setName("");
    onChange({ filter: view.filter, view });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={filtered ? "text-fg" : "text-fg-muted"}>
          <ListFilter className="size-3.5" />
          {active.view ? active.view.name : filtered ? "Filtered" : "Filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-96 flex-col gap-3">
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
                      if (active.view?.id === view.id)
                        onChange({ filter: active.filter, view: null });
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line-subtle pt-2">
          <FilterBuilder filter={active.filter} onChange={setFilter} />
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
          <Button size="sm" onClick={saveCurrent} disabled={!name.trim() || !filtered}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
