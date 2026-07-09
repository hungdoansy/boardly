"use client";

import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { LayoutGrid, Plus, Search, Settings, SlidersHorizontal, Tag } from "lucide-react";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useBoardActions, useBoards, useSelectedBoard } from "../../lib/use-boards";
import { BadgeConfig } from "../board/badge-config";
import { BoardList } from "../board/board-list";
import { BoardView } from "../board/board-view";
import { LabelManager } from "../board/label-manager";

export function WorkspaceApp() {
  return (
    <BoardlyProvider>
      <Shell />
    </BoardlyProvider>
  );
}

function Shell() {
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
          <Button variant="ghost" size="sm" className="w-full justify-start text-fg-muted">
            <Search className="size-4" />
            <span>Search</span>
            <kbd className="ml-auto font-mono text-xs text-fg-faint">⌘K</kbd>
          </Button>
        </div>

        <BoardList />

        <div className="border-t border-line-subtle p-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-overlay text-xs text-fg-muted">
              HD
            </span>
            <span className="truncate text-sm text-fg-muted">hung@moonbase.vn</span>
            <Settings className="ml-auto size-3.5 shrink-0 text-fg-faint" />
          </div>
        </div>
      </aside>

      <MainArea />
    </div>
  );
}

function MainArea() {
  const boards = useBoards();
  const [selected, select] = useSelectedBoard();
  const actions = useBoardActions();
  const active = boards.find((b) => b.id === selected) ?? null;

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
          <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line px-1.5 py-0.5 text-xs text-fg-faint">
            <span className="font-mono">⌘</span>
            <span className="font-mono">K</span>
          </div>
        </div>
      </header>

      {active ? (
        <main className="min-h-0 flex-1">
          <BoardView boardId={active.id} />
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
