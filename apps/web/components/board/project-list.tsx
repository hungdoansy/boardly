"use client";

import type { Project } from "@boardly/domain";
import { formatProjectRef, LABEL_COLORS } from "@boardly/domain";
import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@boardly/ui";
import { Box, Boxes, EyeOff, Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { useSettingsRoute } from "../../lib/use-boards";
import { projectBadge } from "../../lib/use-project-hotkeys";
import {
  type ProjectActions,
  useProjectActions,
  useProjects,
  useSelectedProject,
} from "../../lib/use-projects";

const rowClass = (active: boolean): string =>
  cn(
    "flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-base transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
    active ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover",
  );

/**
 * Sidebar project list. All and each project are real nav destinations backed by
 * the URL hash: selecting one scopes the board/list to its cards. Each project
 * row can be renamed inline (double-click, or the right-click menu's Rename) and
 * recolored/hidden from the same context menu (Unit 10.6) — the fuller manager
 * (incl. restoring hidden projects) still lives in Settings (Unit 6.8/10.5).
 */
export function ProjectList() {
  const projects = useProjects();
  const actions = useProjectActions();
  const [selected, select] = useSelectedProject();
  const [settingsOpen] = useSettingsRoute();
  const [editingId, setEditingId] = useState<string | null>(null);
  // In the Settings view the board scope is not shown, so no row is "active".
  const activeId = settingsOpen ? undefined : selected;

  return (
    <nav className="flex min-h-0 flex-1 flex-col px-2" aria-label="Projects">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">Projects</span>
        <button
          type="button"
          aria-label="Add project"
          onClick={() => {
            const project = actions.create();
            if (project) select(formatProjectRef(project.id, project.name));
          }}
          className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* -mx-1 px-1 gives the 2px focus ring room inside the scroll container:
          `overflow-y-auto` also clips overflow-x, which otherwise cuts the ring
          off at the row's left/right edge. */}
      <ul className="-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1 py-0.5">
        <li>
          <button
            type="button"
            aria-pressed={activeId === null}
            onClick={() => select(null)}
            className={rowClass(activeId === null)}
          >
            <Boxes className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">All</span>
            <kbd className="shrink-0 font-mono text-xs text-fg-faint" aria-hidden="true">
              1
            </kbd>
          </button>
        </li>
        {projects.map((project, index) =>
          editingId === project.id ? (
            <li key={project.id}>
              <RenameRow project={project} actions={actions} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={project.id}>
              <ProjectRow
                project={project}
                active={activeId === project.id}
                badge={projectBadge(index)}
                actions={actions}
                onSelect={() => select(formatProjectRef(project.id, project.name))}
                onStartEdit={() => setEditingId(project.id)}
              />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function ProjectRow({
  project,
  active,
  badge,
  actions,
  onSelect,
  onStartEdit,
}: {
  project: Project;
  active: boolean;
  /** 1-based number shown as a `⌘N` hint on the first few rows, else null. */
  badge: number | null;
  actions: ProjectActions;
  onSelect: () => void;
  onStartEdit: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          onDoubleClick={onStartEdit}
          className={rowClass(active)}
        >
          <Box className="size-3.5 shrink-0" style={{ color: project.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {badge !== null ? (
            <kbd className="shrink-0 font-mono text-xs text-fg-faint" aria-hidden="true">
              {badge}
            </kbd>
          ) : null}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onStartEdit}>
          <Pencil className="size-3.5 text-fg-faint" aria-hidden="true" />
          Rename
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Box className="size-3.5" style={{ color: project.color }} aria-hidden="true" />
            Color
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="grid grid-cols-5 gap-1 p-2">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                onClick={() => actions.recolor(project.id, c.value)}
                className="size-5 rounded-full ring-1 ring-line-subtle transition-transform duration-[var(--dur-fast)] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.archive(project.id)}>
          <EyeOff className="size-3.5 text-fg-faint" aria-hidden="true" />
          Hide
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RenameRow({
  project,
  actions,
  onDone,
}: {
  project: Project;
  actions: ProjectActions;
  onDone: () => void;
}) {
  const [name, setName] = useState(project.name);
  // Finish exactly once. Escape must cancel even though removing the focused
  // input fires a native blur (`focusout`) that would otherwise `finish(true)`
  // and commit the discarded text; the guard makes that trailing blur a no-op.
  const finished = useRef(false);
  const finish = (save: boolean): void => {
    if (finished.current) return;
    finished.current = true;
    if (save) {
      const trimmed = name.trim();
      if (trimmed && trimmed !== project.name) actions.rename(project.id, trimmed);
    }
    onDone();
  };

  return (
    <div className="flex h-7 w-full items-center gap-2 px-2">
      <Box className="size-3.5 shrink-0" style={{ color: project.color }} aria-hidden="true" />
      <input
        aria-label={`Rename ${project.name}`}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        }}
        className="h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-elevated px-1 text-base text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </div>
  );
}
