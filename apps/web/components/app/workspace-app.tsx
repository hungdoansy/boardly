"use client";

import type { Filter, FilterClause } from "@boardly/domain";
import { emptyFilter, isEmptyFilter, Status } from "@boardly/domain";
import { BoardlyMark } from "@boardly/logo";
import { Button, cn, Popover, PopoverContent, PopoverTrigger, Toaster } from "@boardly/ui";
import { Columns3, Command, Keyboard, List, LogOut, Search, Settings, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getBoardDoc } from "@boardly/sync/client";

import { apiClient } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";
import { BoardlyProvider } from "../../lib/boardly-context";
import { cycleFocus } from "../../lib/focus-mode";
import { useLeaderHotkeys } from "../../lib/hotkeys";
import { isEditableTarget } from "../../lib/is-editable-target";
import { useBoardTitle, useSetZoom, useZoom } from "../../lib/use-board";
import { useZoomHotkeys } from "../../lib/use-zoom-hotkeys";
import { applyZoom, cacheZoom } from "../../lib/zoom";
import { useSettingsRoute } from "../../lib/use-boards";
import { setSelectedProject, useSelectedProject } from "../../lib/use-projects";
import { ProjectList } from "../board/project-list";
import { SettingsView } from "../settings/settings-view";
import { BoardView } from "../board/board-view";
import { ImportExportMenu } from "../board/import-export";
import { ListView } from "../board/list-view";
import { LabelManager } from "../board/label-manager";
import { type ActiveView, GroupMenu, SortMenu, ViewsMenu } from "../board/views";
import { CommandPalette } from "../command-palette/palette";
import { ProjectSwitcher } from "../command-palette/project-switcher";
import { ShortcutsOverlay } from "../command-palette/shortcuts-overlay";
import { SearchDialog } from "../search/search";
import { SyncBridge } from "../sync/sync-bridge";
import { FocusToggle } from "./focus-toggle";
import { ThemeToggle } from "./theme-toggle";

/**
 * Whether something already owns the ESC keypress and the global escape ladder
 * must yield: an active dnd-kit keyboard drag (the picked-up card reports
 * `aria-pressed="true"`, same signal keyboard-nav uses) or an open Radix
 * dialog/sheet/command-palette (`data-state="open"` on a `role="dialog"`), which
 * close themselves on ESC. Editable targets and modifier chords are filtered out
 * earlier by the shared guard, so they are not re-checked here.
 */
function escIsOwnedElsewhere(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (document.querySelector('[data-nav="card"][aria-pressed="true"]')) return true;
  if (document.querySelector('[role="dialog"][data-state="open"]')) return true;
  return false;
}

/**
 * Open the inline card composer for a new task. Prefers the Todo column (new
 * cards default to Todo and inherit the active project scope via
 * `useCardActions().create`), falling back to the first visible column's
 * composer when Todo isn't rendered (empty + "hide empty columns"). No-op when
 * no board composer exists (e.g. the Settings view is open). Clicking the "+"
 * opens the composer input (which autofocuses); focusing an already-open input
 * is idempotent.
 */
function openNewTaskComposer(): void {
  if (typeof document === "undefined") return;
  const target =
    document.querySelector<HTMLElement>(`[data-nav-column="${Status.Todo}"] [data-nav-composer]`) ??
    document.querySelector<HTMLElement>("[data-nav-composer]");
  if (!target) return;
  if (target instanceof HTMLInputElement) target.focus();
  else target.click();
}

/**
 * The app-wide keyboard shortcuts installed on `document`: `/` opens search,
 * `?` opens the shortcuts overlay, `c` opens the new-task composer, Shift+F
 * cycles focus mode, and ESC runs a guarded escape ladder that ultimately falls
 * back to the all-projects view (R13). All bail on modifier chords and editable
 * targets so field-level and ⌘-shortcuts pass through. (`g`-prefixed navigation
 * is handled separately by the capture-phase leader mechanism, `useLeaderHotkeys`.)
 */
export function useGlobalKeyboard(opts: {
  onOpenSearch: () => void;
  onOpenHelp: () => void;
  settingsOpen: boolean;
  onExitSettings: () => void;
}): void {
  const { onOpenSearch, onOpenHelp, settingsOpen, onExitSettings } = opts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        onOpenSearch();
        return;
      }
      // `?` is Shift+`/` — `e.key` is "?", so it never collides with the `/` case.
      if (e.key === "?") {
        e.preventDefault();
        onOpenHelp();
        return;
      }
      // New task: open the Todo column composer. Board `c` (a focused column's
      // composer) wins — it preventDefaults when it acts, so we bail on
      // defaultPrevented; and we yield while an overlay owns the keyboard.
      if (e.code === "KeyC") {
        if (e.defaultPrevented) return;
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        e.preventDefault();
        openNewTaskComposer();
        return;
      }
      if (e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        cycleFocus();
        return;
      }
      if (e.key === "Escape") {
        // Yield to whatever already owns ESC (open dialog/sheet/palette, active
        // drag); those close/cancel themselves and must not also step the ladder.
        if (escIsOwnedElsewhere(e)) return;
        // Ladder: exit the Settings pane first, else reset scope to All projects.
        if (settingsOpen) {
          e.preventDefault();
          onExitSettings();
        } else {
          e.preventDefault();
          setSelectedProject(null);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenSearch, onOpenHelp, settingsOpen, onExitSettings]);
}

/** The leader-key ("g" then …) bindings: `g` `p` opens the Project Switcher. */
const LEADER_REGISTRY = { KeyP: "project-switcher" } as const;

export function WorkspaceApp() {
  return (
    <BoardlyProvider>
      <Shell />
    </BoardlyProvider>
  );
}

function Shell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Single per-user board: an empty doc is a valid board that renders the eight
  // fixed status columns. No client-side meta seeding — board-meta defaults
  // (title fallback, default badge face, empty prefix) are supplied at read time
  // so a fresh device never clobbers a synced board's real config.
  const [settingsOpen, setSettingsOpen] = useSettingsRoute();

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openSwitcher = useCallback(() => setSwitcherOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const exitSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  useGlobalKeyboard({
    onOpenSearch: openSearch,
    onOpenHelp: openHelp,
    settingsOpen,
    onExitSettings: exitSettings,
  });
  useLeaderHotkeys(LEADER_REGISTRY, { "project-switcher": openSwitcher });

  // Whole-app zoom (UNIT-15): the synced board-meta factor is the source of
  // truth. The ⌘/Ctrl +/−/0 shortcuts write the next factor through the command.
  const zoom = useZoom();
  const setZoom = useSetZoom();
  const { userId } = useAuthSession();
  // Apply only AFTER the board doc hydrates from IndexedDB. Before `whenSynced`,
  // `useZoom()` returns the default (1) from a still-empty doc; applying that
  // would clobber the pre-paint `ZOOM_INIT` stamp (web) and bounce native zoom
  // (desktop) — a visible 100%→level flash. Gating on sync preserves the
  // no-FOUC guarantee: the pre-paint value stays until the real value is known,
  // then this reconciles to it (and refreshes the device cache).
  const [docSynced, setDocSynced] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getBoardDoc(userId).whenSynced.then(() => {
      if (!cancelled) setDocSynced(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  useEffect(() => {
    if (!docSynced) return;
    applyZoom(zoom);
    cacheZoom(zoom);
  }, [zoom, docSynced]);
  useZoomHotkeys(zoom, setZoom);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        onOpenSearch={openSearch}
        onOpenHelp={openHelp}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsOpen ? <SettingsView onClose={() => setSettingsOpen(false)} /> : <MainArea />}
      <CommandPalette onGoToProject={openSwitcher} onShowShortcuts={openHelp} />
      <ProjectSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
      <ShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <SyncBridge />
      {/* Mounted here (sibling of <main>) so its fixed viewport is clear of the
          Calm/Zen focus `filter` that would otherwise offset it. */}
      <Toaster />
    </div>
  );
}

/**
 * The left sidebar. Top-to-bottom: logo, Search, the project list (grows to
 * fill), then Settings as the last full-width nav item (R12), and finally the
 * account/theme footer. Settings drives the `#settings` hash route and reflects
 * `aria-pressed`; the account button and theme toggle stay in the footer.
 */
export function Sidebar({
  onOpenSearch,
  onOpenHelp,
  settingsOpen,
  onOpenSettings,
}: {
  onOpenSearch: () => void;
  onOpenHelp: () => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}) {
  const { userId } = useAuthSession();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line-subtle bg-surface sm:w-60">
      <div className="flex h-12 items-center gap-2 px-3">
        <BoardlyMark className="size-6" />
        <span className="text-md font-semibold tracking-[-0.01em] text-fg">Boardly</span>
      </div>

      <div className="px-2 pb-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSearch}
          className="w-full justify-start text-fg-muted"
        >
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto font-mono text-xs text-fg-faint">/</kbd>
        </Button>
      </div>

      <ProjectList />

      <div className="px-2 pb-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Settings"
          aria-pressed={settingsOpen}
          onClick={onOpenSettings}
          className={cn(
            "w-full justify-start",
            settingsOpen ? "bg-selected text-fg" : "text-fg-muted",
          )}
        >
          <Settings className="size-4" />
          <span>Settings</span>
        </Button>
      </div>

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
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={onOpenHelp}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-muted transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Keyboard className="size-3.5" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function MainArea() {
  const title = useBoardTitle();

  const [activeView, setActiveView] = useState<ActiveView>({
    filter: emptyFilter(),
    view: null,
    groupBy: null,
    sort: null,
    layout: "board",
  });

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
        <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">{title || "Boardly"}</h1>
        <div className="flex items-center gap-2">
          <LayoutSwitch
            layout={activeView.layout}
            onChange={(layout) => setActiveView((v) => ({ ...v, layout, view: null }))}
          />
          <GroupMenu
            groupBy={activeView.groupBy}
            onChange={(groupBy) => setActiveView((v) => ({ ...v, groupBy, view: null }))}
          />
          <SortMenu
            sort={activeView.sort}
            onChange={(sort) => setActiveView((v) => ({ ...v, sort, view: null }))}
          />
          <ViewsMenu active={activeView} onChange={setActiveView} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="text-fg-muted">
                <Tag className="size-3.5" />
                Labels
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <LabelManager />
            </PopoverContent>
          </Popover>
          <ImportExportMenu boardTitle={title || "board"} />
          <FocusToggle />
          <kbd className="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-line px-1.5 py-0.5 text-xs text-fg-faint sm:flex">
            <Command className="size-3" aria-hidden="true" />
            <span className="font-mono">K</span>
          </kbd>
        </div>
      </header>

      <main className="min-h-0 flex-1" data-focus-scope>
        {activeView.layout === "list" ? (
          <ListView filter={filter} groupBy={activeView.groupBy} sort={activeView.sort} />
        ) : (
          <BoardView filter={filter} groupBy={activeView.groupBy} />
        )}
      </main>
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
