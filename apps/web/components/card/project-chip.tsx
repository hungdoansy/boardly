import type { Project } from "@boardly/domain";
import { Box } from "lucide-react";

import { CHIP } from "./chip";

/**
 * Card-face project chip. Following Linear, a project reads as a boxed glyph +
 * name; the project color rides on the box icon while the name stays in the
 * neutral foreground so it's legible for every palette pick.
 */
export function ProjectChip({ project }: { project: Project }) {
  return (
    <span className={CHIP} title={`Project: ${project.name}`} aria-label={`Project: ${project.name}`}>
      <Box className="size-3 shrink-0" style={{ color: project.color }} aria-hidden="true" />
      <span className="max-w-[10rem] truncate">{project.name}</span>
    </span>
  );
}
