"use client";

import type { Project } from "@boardly/domain";
import { LABEL_COLORS } from "@boardly/domain";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Eye, EyeOff, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type ProjectActions,
  useArchivedProjects,
  useProjectActions,
  useProjects,
} from "../../lib/use-projects";

/** Manage the board's projects: create, rename, recolor, hide, and restore. */
export function ProjectSettings() {
  const projects = useProjects();
  const archived = useArchivedProjects();
  const actions = useProjectActions();

  return (
    <section className="flex max-w-md flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          Projects group tickets on the board. A card belongs to one project.
        </p>
        <Button size="sm" variant="outline" onClick={() => actions.create()}>
          <Plus className="size-3.5" />
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-faint">No projects yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} actions={actions} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1">
          <span className="px-1 text-xs font-medium uppercase tracking-wide text-fg-faint">
            Hidden
          </span>
          <ul className="flex flex-col gap-0.5">
            {archived.map((project) => (
              <HiddenRow key={project.id} project={project} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProjectRow({ project, actions }: { project: Project; actions: ProjectActions }) {
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);

  const commit = (): void => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) actions.rename(project.id, trimmed);
    else setName(project.name);
  };

  return (
    <li className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Color for ${project.name}`}
            className="size-3.5 shrink-0 rounded-full ring-1 ring-line-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ backgroundColor: project.color }}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1.5">
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
          </div>
        </PopoverContent>
      </Popover>

      <Input
        aria-label={`Rename ${project.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="h-7 flex-1 border-transparent bg-transparent px-1 hover:border-line focus:border-line"
      />

      <button
        type="button"
        aria-label={`Hide ${project.name}`}
        onClick={() => actions.archive(project.id)}
        className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
      >
        <EyeOff className="size-3.5" />
      </button>
    </li>
  );
}

function HiddenRow({ project, actions }: { project: Project; actions: ProjectActions }) {
  return (
    <li className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover">
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 rounded-full opacity-60 ring-1 ring-line-subtle"
        style={{ backgroundColor: project.color }}
      />
      <span className="flex-1 truncate px-1 text-sm text-fg-muted">{project.name}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Show ${project.name}`}
        onClick={() => actions.show(project.id)}
        className="h-7 text-fg-muted"
      >
        <Eye className="size-3.5" />
        Show
      </Button>
    </li>
  );
}
