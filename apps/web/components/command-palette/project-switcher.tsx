"use client";

import { formatProjectRef } from "@boardly/domain";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { Box, Boxes } from "lucide-react";

import { setSelectedProject, useProjects } from "../../lib/use-projects";

/**
 * The Project Switcher (opened by `g` then `p`, or the palette's "Go to
 * project…"). A `cmdk` dialog listing "All" + every project; arrow keys move
 * between rows and typing filters — this is the app's keyboard mechanism for
 * moving between projects. Selecting a row jumps the board scope via the URL
 * hash (`setSelectedProject`), where "All" is `null`.
 */
export function ProjectSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const projects = useProjects();

  const go = (ref: string | null): void => {
    setSelectedProject(ref);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Go to project">
      <CommandInput placeholder="Go to project…" />
      <CommandList>
        <CommandEmpty>No projects.</CommandEmpty>
        <CommandGroup heading="Projects">
          <CommandItem value="all projects" onSelect={() => go(null)}>
            <Boxes className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
            All
          </CommandItem>
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              value={`project ${project.name}`}
              onSelect={() => go(formatProjectRef(project.id, project.name))}
            >
              <Box
                className="size-3.5 shrink-0"
                style={{ color: project.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
