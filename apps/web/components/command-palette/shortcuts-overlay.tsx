"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@boardly/ui";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Command as CommandIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The keyboard-shortcuts overlay (opened by `?`, or the palette's "Keyboard
 * shortcuts"). Fulfils DESIGN.md §5 ("document shortcuts in a `?` overlay").
 *
 * Keys render as `<kbd>` keycaps (DESIGN.md §7.1's text-keycap exception). Per
 * that same rule, the command (⌘) key is the lucide `Command` icon — never the
 * glyph — and arrow keys use lucide arrow icons, since arrow glyphs are banned
 * even inside keycaps.
 */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-line bg-elevated px-1.5 font-mono text-xs text-fg-muted">
      {children}
    </kbd>
  );
}

interface Shortcut {
  label: string;
  keys: ReactNode;
}

interface ShortcutGroup {
  heading: string;
  shortcuts: Shortcut[];
}

const ARROW = "size-3";

const GROUPS: ShortcutGroup[] = [
  {
    heading: "General",
    shortcuts: [
      {
        label: "Command palette",
        keys: (
          <Kbd>
            <CommandIcon className="size-3" aria-hidden="true" />K
          </Kbd>
        ),
      },
      { label: "Search", keys: <Kbd>/</Kbd> },
      { label: "Keyboard shortcuts", keys: <Kbd>?</Kbd> },
      {
        label: "Cycle focus mode",
        keys: (
          <>
            <Kbd>Shift</Kbd>
            <Kbd>F</Kbd>
          </>
        ),
      },
      { label: "Back / close", keys: <Kbd>Esc</Kbd> },
    ],
  },
  {
    heading: "Navigation",
    shortcuts: [
      {
        label: "Go to project",
        keys: (
          <>
            <Kbd>G</Kbd>
            <span className="text-fg-faint">then</span>
            <Kbd>P</Kbd>
          </>
        ),
      },
      { label: "New task", keys: <Kbd>C</Kbd> },
    ],
  },
  {
    heading: "Board (with a card or column focused)",
    shortcuts: [
      {
        label: "Move focus",
        keys: (
          <>
            <Kbd>
              <ArrowUp className={ARROW} aria-hidden="true" />
            </Kbd>
            <Kbd>
              <ArrowDown className={ARROW} aria-hidden="true" />
            </Kbd>
            <Kbd>
              <ArrowLeft className={ARROW} aria-hidden="true" />
            </Kbd>
            <Kbd>
              <ArrowRight className={ARROW} aria-hidden="true" />
            </Kbd>
          </>
        ),
      },
      { label: "Open focused card", keys: <Kbd>Enter</Kbd> },
      { label: "Add card to focused column", keys: <Kbd>C</Kbd> },
      { label: "Archive focused card", keys: <Kbd>E</Kbd> },
      { label: "Cycle priority", keys: <Kbd>P</Kbd> },
    ],
  },
];

export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <section key={group.heading} className="flex flex-col gap-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                {group.heading}
              </h3>
              <ul className="flex flex-col">
                {group.shortcuts.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-4 py-1 text-base text-fg-muted"
                  >
                    <span>{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1">{s.keys}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
