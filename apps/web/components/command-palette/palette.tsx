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
import { FileText, Maximize, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

import { useCardActions, useSetZoom, useZoom } from "../../lib/use-board";
import { useOpenCardNav } from "../../lib/use-boards";
import { useSearchDocs } from "../search/use-search";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchDocs = useSearchDocs();
  const openCard = useOpenCardNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // e.code (physical key position) is used instead of e.key so the shortcut
      // fires consistently on non-QWERTY/non-Latin keyboard layouts.
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const setOpenState = (next: boolean): void => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const run = (fn: () => void): void => {
    fn();
    setOpenState(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpenState}>
      <CommandInput
        placeholder="Type a command or search…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <NewCardItem onRun={() => setOpen(false)} />
          <ZoomItems onRun={() => setOpen(false)} />
        </CommandGroup>

        {query.trim() && searchDocs.length > 0 ? (
          <CommandGroup heading="Cards">
            {searchDocs.map((doc) => (
              <CommandItem
                key={doc.cardId}
                value={`card ${doc.title} ${doc.shortId} ${doc.labels.join(" ")} ${doc.boardTitle}`}
                onSelect={() => run(() => openCard(doc.cardId))}
              >
                <FileText className="size-4" />
                <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                <span className="ml-2 shrink-0 font-mono text-xs text-fg-faint">{doc.shortId}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
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
      <Plus className="size-4" />
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
