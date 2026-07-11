"use client";

import type { Project } from "@boardly/domain";
import { LABEL_COLORS } from "@boardly/domain";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Archive, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { type ProjectActions, useProjectActions, useProjects } from "../../lib/use-projects";

/** Manage the board's projects: create, rename, recolor, archive. */
export function ProjectSettings({ boardId }: { boardId: string }) {
  const projects = useProjects(boardId);
  const actions = useProjectActions(boardId);

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
        aria-label={`Archive ${project.name}`}
        onClick={() => actions.archive(project.id)}
        className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
      >
        <Archive className="size-3.5" />
      </button>
    </li>
  );
}
