"use client";

import { formatProjectRef } from "@boardly/domain";
import { cn } from "@boardly/ui";
import { Box, Boxes, Plus } from "lucide-react";

import { useSettingsRoute } from "../../lib/use-boards";
import { useProjectActions, useProjects, useSelectedProject } from "../../lib/use-projects";

/**
 * Sidebar project list. All and each project are real nav destinations backed by
 * the URL hash: selecting one scopes the board/list to its cards (and, from the
 * Settings view, navigates back to that board). While Settings is open none of
 * the rows read as active. Creating a project selects it (so new cards land in
 * it). Rename/recolor/archive live in Settings (Unit 6.8).
 */
export function ProjectList() {
  const projects = useProjects();
  const actions = useProjectActions();
  const [selected, select] = useSelectedProject();
  const [settingsOpen] = useSettingsRoute();
  // In the Settings view the board scope is not shown, so no row is "active".
  const activeId = settingsOpen ? undefined : selected;

  const rowClass = (active: boolean): string =>
    cn(
      "flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-base transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      active ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover",
    );

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

      <ul className="flex flex-col gap-0.5 overflow-y-auto">
        <li>
          <button
            type="button"
            aria-pressed={activeId === null}
            onClick={() => select(null)}
            className={rowClass(activeId === null)}
          >
            <Boxes className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
            <span className="truncate">All</span>
          </button>
        </li>
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              aria-pressed={activeId === project.id}
              onClick={() => select(formatProjectRef(project.id, project.name))}
              className={rowClass(activeId === project.id)}
            >
              <Box
                className="size-3.5 shrink-0"
                style={{ color: project.color }}
                aria-hidden="true"
              />
              <span className="truncate">{project.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
