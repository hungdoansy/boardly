"use client";

import { emptyFilter, isEmptyFilter } from "@boardly/domain";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { LayoutGrid, LogOut, Plus, Search, SlidersHorizontal, Tag } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";
import { BoardlyProvider } from "../../lib/boardly-context";
import { useBoardActions, useBoards, useSelectedBoard } from "../../lib/use-boards";
import { BadgeConfig } from "../board/badge-config";
import { BoardList } from "../board/board-list";
import { BoardView } from "../board/board-view";
import { ImportExportMenu } from "../board/import-export";
import { LabelManager } from "../board/label-manager";
import { type ActiveView, ViewsMenu } from "../board/views";
import { CommandPalette } from "../command-palette/palette";
import { SearchDialog } from "../search/search";
import { SyncBridge } from "../sync/sync-bridge";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line-subtle bg-surface">
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

        <div className="border-t border-line-subtle p-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-overlay text-xs text-fg-muted">
              {(userId ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-sm text-fg-muted">Account</span>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => void apiClient.logout()}
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <LogOut className="size-3.5" />
            </button>
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
  const actions = useBoardActions();
  const active = boards.find((b) => b.id === selected) ?? null;

  const [activeView, setActiveView] = useState<ActiveView>({
    filter: emptyFilter(),
    view: null,
    groupBy: null,
  });
  // Reset the applied view when switching boards (views are per-board).
  useEffect(() => {
    setActiveView({ filter: emptyFilter(), view: null, groupBy: null });
  }, [selected]);
  const filter = isEmptyFilter(activeView.filter) ? undefined : activeView.filter;

  const createAndOpen = (): void => {
    select(actions.create());
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">
          {active ? active.title : "Welcome"}
        </h1>
        <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line px-1.5 py-0.5 text-xs text-fg-faint">
            <span className="font-mono">⌘</span>
            <span className="font-mono">K</span>
          </div>
        </div>
      </header>

      {active ? (
        <main className="min-h-0 flex-1">
          <BoardView boardId={active.id} filter={filter} groupBy={activeView.groupBy} />
        </main>
      ) : (
        <main className="grid flex-1 place-items-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-elevated text-fg-faint">
              <LayoutGrid className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">
                No board selected
              </h2>
              <p className="text-base text-fg-muted">
                Create a board to start organizing your work. Everything stays local and syncs
                across your devices.
              </p>
            </div>
            <Button className="mt-1" onClick={createAndOpen}>
              <Plus className="size-4" />
              Create board
            </Button>
          </div>
        </main>
      )}
    </div>
  );
}
