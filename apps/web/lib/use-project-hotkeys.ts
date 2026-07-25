"use client";

import { formatProjectRef } from "@boardly/domain";
import { useEffect, useRef } from "react";

import { setSelectedProject, useProjects } from "./use-projects";

/**
 * `⌘/Ctrl + 1…5` jump to the first five sidebar destinations and `⌘/Ctrl + 6`
 * opens the Project Switcher. The sidebar list starts with "All", so the numbered
 * destinations are **All (⌘1)** then the first four projects (⌘2…5) — this keeps a
 * chord back to the full board. They are the direct-chord counterpart to the
 * sidebar's `1…5` badges and the `g` `p` leader sequence.
 *
 * The resolver is a pure function of the pressed key `code` and the visible
 * project count so it is unit-testable without a DOM.
 */
export type ProjectHotkey =
  { kind: "all" } | { kind: "select"; index: number } | { kind: "switcher" };

/** Total numbered sidebar rows (All + up to four projects) that carry a `⌘N` badge. */
export const NUMBERED_SLOT_COUNT = 5;

const DIGIT_TO_SLOT: Readonly<Record<string, number>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
};

/**
 * Map a physical digit `code` to an action. Slot 0 (`⌘1`) is always "All"; slots
 * 1…4 (`⌘2…5`) select the matching project only when it exists (so `⌘4` with two
 * projects is a no-op that leaves the key to the browser); `Digit6` always opens
 * the switcher. `e.code` (not `e.key`) keeps this layout-independent.
 */
export function resolveProjectHotkey(
  code: string,
  visibleProjectCount: number,
): ProjectHotkey | null {
  if (code === "Digit6") return { kind: "switcher" };
  const slot = DIGIT_TO_SLOT[code];
  if (slot === undefined) return null;
  if (slot === 0) return { kind: "all" };
  const index = slot - 1;
  if (index >= visibleProjectCount) return null;
  return { kind: "select", index };
}

/**
 * The `⌘N` badge for the project at `index` in the sidebar (All is `⌘1`, so the
 * first project is `⌘2`), or null when it is past the numbered range.
 */
export function projectBadge(index: number): number | null {
  const badge = index + 2;
  return badge <= NUMBERED_SLOT_COUNT ? badge : null;
}

/**
 * Install the `⌘/Ctrl + 1…6` project chords on `document`. The live project list
 * and `onOpenSwitcher` are read from refs so the listener is installed once and
 * never churns as projects stream in from Yjs.
 *
 * Note (web): browsers bind `⌘/Ctrl + 1…8` to tab switching and may not hand the
 * event to the page; the chord is reliable in the desktop (single-window)
 * webview. `preventDefault` is best-effort where the browser allows it.
 */
export function useProjectHotkeys(onOpenSwitcher: () => void): void {
  const projects = useProjects();
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const openSwitcherRef = useRef(onOpenSwitcher);
  openSwitcherRef.current = onOpenSwitcher;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Primary modifier only (⌘ on mac, Ctrl elsewhere) — never with Shift/Alt,
      // so this can't collide with other chords.
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const action = resolveProjectHotkey(e.code, projectsRef.current.length);
      if (!action) return;
      e.preventDefault();
      if (action.kind === "switcher") {
        openSwitcherRef.current();
        return;
      }
      if (action.kind === "all") {
        setSelectedProject(null);
        return;
      }
      const project = projectsRef.current[action.index];
      if (project) setSelectedProject(formatProjectRef(project.id, project.name));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
