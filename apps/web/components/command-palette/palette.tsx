"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { DEFAULT_ZOOM, zoomIn, zoomOut } from "@boardly/domain";
import {
  Boxes,
  Check,
  Eye,
  FileText,
  Keyboard,
  Maximize,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCardActions, useSetZoom, useZoom } from "../../lib/use-board";
import { useOpenCardNav } from "../../lib/use-boards";
import { useArchivedProjects } from "../../lib/use-projects";
import { HiddenProjectMarker } from "../search/hidden-project-marker";
import { useSearchDocs } from "../search/use-search";

export function CommandPalette({
  onGoToProject,
  onShowShortcuts,
}: {
  /** Open the Project Switcher (same target as the `g` `p` shortcut). */
  onGoToProject: () => void;
  /** Open the shortcuts overlay (same target as the `?` shortcut). */
  onShowShortcuts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Reveal cards from hidden projects. Ephemeral by design (UNIT-20, R6): a
  // sticky "include hidden" would quietly undo the exclusion the user asked for
  // by hiding the project.
  const [includeHidden, setIncludeHidden] = useState(false);
  const searchDocs = useSearchDocs({ includeHidden });
  // The toggle only exists on a board that has something to reveal; a
  // permanently dead row in the keyboard hub is chrome for a state most boards
  // never reach.
  const hasHiddenProjects = useArchivedProjects().length > 0;
  const openCard = useOpenCardNav();
  // Set while handing off to another dialog so the palette's own close-focus
  // restore is suppressed (see `onCloseAutoFocus` below).
  const chainingRef = useRef(false);

  const setOpenState = useCallback((next: boolean): void => {
    setOpen(next);
    // `includeHidden` resets on the *open* transition rather than on close:
    // several paths close the palette with a bare `setOpen(false)`, and a
    // close-side reset would silently miss them.
    if (next) setIncludeHidden(false);
    else setQuery("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // e.code (physical key position) is used instead of e.key so the shortcut
      // fires consistently on non-QWERTY/non-Latin keyboard layouts.
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        // Routed through the wrapper, not `setOpen`, so ⌘K gets the per-open
        // resets like every other route in.
        setOpenState(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpenState]);

  const run = (fn: () => void): void => {
    fn();
    setOpenState(false);
  };

  // Opening another dialog (switcher / shortcuts) from the palette: close the
  // palette and open the target in the same tick. `chainingRef` makes the
  // palette's `onCloseAutoFocus` a no-op so Radix doesn't restore focus to the
  // (unmounting) palette ~220ms later and steal it back from the new dialog —
  // Radix keeps the closing FocusScope mounted for the full exit animation.
  const runThenOpen = (openTarget: () => void): void => {
    chainingRef.current = true;
    setOpenState(false);
    openTarget();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpenState}
      onCloseAutoFocus={(e) => {
        if (chainingRef.current) {
          e.preventDefault();
          chainingRef.current = false;
        }
      }}
    >
      <CommandInput
        placeholder="Type a command or search…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <NewCardItem onRun={() => setOpen(false)} />
          <CommandItem
            value="go to project switch navigate"
            onSelect={() => runThenOpen(onGoToProject)}
          >
            <Boxes className="size-3.5" />
            Go to project…
          </CommandItem>
          <CommandItem
            value="keyboard shortcuts help"
            onSelect={() => runThenOpen(onShowShortcuts)}
          >
            <Keyboard className="size-3.5" />
            Keyboard shortcuts
          </CommandItem>
          <ZoomItems onRun={() => setOpen(false)} />
        </CommandGroup>

        {hasHiddenProjects ? (
          <IncludeHiddenItem checked={includeHidden} onToggle={() => setIncludeHidden((v) => !v)} />
        ) : null}

        {query.trim() && searchDocs.length > 0 ? (
          <CommandGroup heading="Cards">
            {searchDocs.map((doc) => (
              <CommandItem
                key={doc.cardId}
                // Deliberately no project name: cmdk ranks on this string, so a
                // marker's text in here would match every card the project holds.
                value={`card ${doc.title} ${doc.shortId} ${doc.labels.join(" ")} ${doc.boardTitle}`}
                onSelect={() => run(() => openCard(doc.cardId))}
              >
                <FileText className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                <HiddenProjectMarker doc={doc} />
                <span className="ml-2 shrink-0 font-mono text-xs text-fg-faint">{doc.shortId}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * The per-open "reveal hidden-project cards" switch (UNIT-20, R5).
 *
 * Both the item and its group are `forceMount`ed. cmdk gates an item on
 * `forceMount || filter() === false ? true : search ? filtered.items.get(id) > 0
 * : true` and hides the enclosing group unless it survived the same pass — so a
 * plain row would vanish the moment the user types, which is precisely when the
 * user needs it (they typed a term only a hidden card matches and are staring at
 * "No results."). Force-mounted items are also left out of cmdk's registry, so
 * the row never props up `filtered.count` and "No results." still shows.
 *
 * `role` cannot be set on a `CommandItem` — cmdk hardcodes `role="option"` after
 * spreading caller props — so the state rides on `aria-checked`, which `option`
 * supports; a menu role would be invalid inside cmdk's `role="listbox"` anyway.
 * Only the *visual* half of DESIGN.md §7's multi-toggle pattern is reused: the
 * right-aligned check in a `pr-7` gutter. `onSelect` deliberately omits any
 * close call, so arrow-then-Enter flips the switch and leaves the result on
 * screen. `Eye` (not `EyeOff`) because this control reveals — `EyeOff` is the
 * hide action everywhere else in the app.
 */
function IncludeHiddenItem({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <CommandGroup heading="Search options" forceMount>
      <CommandItem
        forceMount
        value="include hidden projects archived"
        aria-checked={checked}
        onSelect={onToggle}
        className="pr-7"
      >
        <Eye className="size-3.5" aria-hidden="true" />
        Include hidden projects
        <span className="absolute right-2 flex size-3.5 items-center justify-center">
          {checked ? <Check className="size-3.5 text-[var(--accent)]" aria-hidden="true" /> : null}
        </span>
      </CommandItem>
    </CommandGroup>
  );
}

function NewCardItem({ onRun }: { onRun: () => void }) {
  const actions = useCardActions();
  return (
    <CommandItem
      value="new card create"
      onSelect={() => {
        // A card's column is its status; a new card defaults to Todo.
        actions.create("New card");
        onRun();
      }}
    >
      <Plus className="size-3.5" />
      New card
    </CommandItem>
  );
}

/**
 * Whole-app zoom actions (UNIT-15) — the keyboard-free path to ⌘/Ctrl +/−/0,
 * and the agent-native surface (any UI action an agent can take too, R13). The
 * reset item shows the live level so the palette doubles as a zoom readout.
 */
function ZoomItems({ onRun }: { onRun: () => void }) {
  const zoom = useZoom();
  const setZoom = useSetZoom();
  const run = (factor: number): void => {
    setZoom(factor);
    onRun();
  };
  return (
    <>
      <CommandItem value="zoom in larger" onSelect={() => run(zoomIn(zoom))}>
        <ZoomIn className="size-4" />
        Zoom in
        <kbd className="ml-auto font-mono text-xs text-fg-faint">⌘+</kbd>
      </CommandItem>
      <CommandItem value="zoom out smaller" onSelect={() => run(zoomOut(zoom))}>
        <ZoomOut className="size-4" />
        Zoom out
        <kbd className="ml-auto font-mono text-xs text-fg-faint">⌘-</kbd>
      </CommandItem>
      <CommandItem value="zoom reset actual size 100%" onSelect={() => run(DEFAULT_ZOOM)}>
        <Maximize className="size-4" />
        <span className="min-w-0 flex-1">Reset zoom</span>
        <span className="ml-2 shrink-0 font-mono text-xs text-fg-faint">
          {Math.round(zoom * 100)}%
        </span>
      </CommandItem>
    </>
  );
}
