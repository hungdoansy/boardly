"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useCardActions } from "../../lib/use-board";
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
