"use client";

import type { Filter, FilterClause } from "@boardly/domain";
import { emptyFilter, isEmptyFilter } from "@boardly/domain";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import {
  Columns3,
  Command,
  LayoutGrid,
  List,
  LogOut,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiClient } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";
import { BoardlyProvider } from "../../lib/boardly-context";
import { cycleFocus } from "../../lib/focus-mode";
import { useBoards, useEnsureBoard, useSelectedBoard } from "../../lib/use-boards";
import { useSelectedProject } from "../../lib/use-projects";
import { BadgeConfig } from "../board/badge-config";
import { BoardList } from "../board/board-list";
import { ProjectList } from "../board/project-list";
import { BoardView } from "../board/board-view";
import { ImportExportMenu } from "../board/import-export";
import { ListView } from "../board/list-view";
import { LabelManager } from "../board/label-manager";
import { type ActiveView, GroupMenu, SortMenu, ViewsMenu } from "../board/views";
import { CommandPalette } from "../command-palette/palette";
import { SearchDialog } from "../search/search";
import { SyncBridge } from "../sync/sync-bridge";
import { FocusToggle } from "./focus-toggle";
import { ThemeToggle } from "./theme-toggle";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function WorkspaceApp() {
  return (
    <BoardlyProvider>
      <Shell />
    </BoardlyProvider>
  );
}

function Shell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { userId } = useAuthSession();
  // Single-board: provision + keep the one board selected (Unit 2).
  useEnsureBoard();
  const [boardId] = useSelectedBoard();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        cycleFocus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line-subtle bg-surface sm:w-60">
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="grid size-6 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground">
            <LayoutGrid className="size-3.5" />
          </div>
          <span className="text-md font-semibold tracking-[-0.01em] text-fg">Boardly</span>
        </div>

        <div className="px-2 pb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="w-full justify-start text-fg-muted"
          >
            <Search className="size-4" />
            <span>Search</span>
            <kbd className="ml-auto font-mono text-xs text-fg-faint">/</kbd>
          </Button>
        </div>

        <BoardList />
        {boardId ? <ProjectList boardId={boardId} /> : null}

        <div className="border-t border-line-subtle p-2">
          <div className="flex items-center gap-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-overlay text-xs text-fg-muted">
                    {(userId ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate text-sm text-fg-muted">Account</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-48 p-1">
                <button
                  type="button"
                  onClick={() => void apiClient.logout()}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </PopoverContent>
            </Popover>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <MainArea />
      <CommandPalette />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <SyncBridge />
    </div>
  );
}

function MainArea() {
  const boards = useBoards();
  const [selected, select] = useSelectedBoard();
  const active = boards.find((b) => b.id === selected) ?? null;

  const [activeView, setActiveView] = useState<ActiveView>({
    filter: emptyFilter(),
    view: null,
    groupBy: null,
    sort: null,
    layout: "board",
  });
  // Reset the applied view when switching boards (views are per-board).
  useEffect(() => {
    setActiveView({
      filter: emptyFilter(),
      view: null,
      groupBy: null,
      sort: null,
      layout: "board",
    });
  }, [selected]);

  // The active project scope (Unit 6.7) is ANDed with the saved-view filter and
  // threaded down as one filter, so every card list (columns, reclaim, swimlanes,
  // list view) honors it with no extra plumbing.
  const [projectId] = useSelectedProject();
  const effectiveFilter = useMemo<Filter>(() => {
    if (!projectId) return activeView.filter;
    const projectClause: FilterClause = {
      field: "project",
      condition: "is",
      values: [projectId],
    };
    return {
      op: "and",
      clauses: isEmptyFilter(activeView.filter)
        ? [projectClause]
        : [activeView.filter, projectClause],
    };
  }, [activeView.filter, projectId]);
  const filter = isEmptyFilter(effectiveFilter) ? undefined : effectiveFilter;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">
          {active ? active.title : "Boardly"}
        </h1>
        <div className="flex items-center gap-2">
          {active ? (
            <LayoutSwitch
              layout={activeView.layout}
              onChange={(layout) => setActiveView((v) => ({ ...v, layout, view: null }))}
            />
          ) : null}
          {active ? (
            <GroupMenu
              groupBy={activeView.groupBy}
              onChange={(groupBy) => setActiveView((v) => ({ ...v, groupBy, view: null }))}
            />
          ) : null}
          {active ? (
            <SortMenu
              sort={activeView.sort}
              onChange={(sort) => setActiveView((v) => ({ ...v, sort, view: null }))}
            />
          ) : null}
          {active ? (
            <ViewsMenu boardId={active.id} active={activeView} onChange={setActiveView} />
          ) : null}
          {active ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-fg-muted">
                  <Tag className="size-3.5" />
                  Labels
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <LabelManager boardId={active.id} />
              </PopoverContent>
            </Popover>
          ) : null}
          {active ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-fg-muted">
                  <SlidersHorizontal className="size-3.5" />
                  Badges
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <BadgeConfig boardId={active.id} />
              </PopoverContent>
            </Popover>
          ) : null}
          <ImportExportMenu
            boardId={active?.id ?? null}
            boardTitle={active?.title ?? "board"}
            onImported={select}
          />
          {active ? <FocusToggle /> : null}
          <kbd className="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-line px-1.5 py-0.5 text-xs text-fg-faint sm:flex">
            <Command className="size-3" aria-hidden="true" />
            <span className="font-mono">K</span>
          </kbd>
        </div>
      </header>

      {active ? (
        <main className="min-h-0 flex-1" data-focus-scope>
          {activeView.layout === "list" ? (
            <ListView
              boardId={active.id}
              filter={filter}
              groupBy={activeView.groupBy}
              sort={activeView.sort}
            />
          ) : (
            <BoardView boardId={active.id} filter={filter} groupBy={activeView.groupBy} />
          )}
        </main>
      ) : (
        <main className="grid flex-1 place-items-center p-6" aria-busy="true">
          <div
            className="size-5 animate-spin rounded-full border-2 border-line border-t-transparent"
            role="status"
            aria-label="Loading board"
          />
        </main>
      )}
    </div>
  );
}

/** Board ↔ List segmented switch. V1.4 grows this toolbar with sort/group menus. */
function LayoutSwitch({
  layout,
  onChange,
}: {
  layout: "board" | "list";
  onChange: (layout: "board" | "list") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-line"
    >
      {(
        [
          { value: "board", label: "Board", Icon: Columns3 },
          { value: "list", label: "List", Icon: List },
        ] as const
      ).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          aria-label={label}
          onClick={() => onChange(value)}
          className={
            layout === value
              ? "grid size-7 place-items-center bg-overlay text-fg"
              : "grid size-7 place-items-center text-fg-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          }
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
