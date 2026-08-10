"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { Check, Eye } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { useOpenCardNav } from "../../lib/use-boards";
import { useArchivedProjects } from "../../lib/use-projects";
import { HiddenProjectMarker } from "./hidden-project-marker";
import { recentDocs, searchDocs, type SearchDoc } from "./search-index";
import { useSearchDocs } from "./use-search";

/**
 * Instant fuzzy search across every board's cards. A cmdk palette with our own
 * ranking (`shouldFilter={false}`): empty query shows recents, a query shows
 * ranked matches, selecting a result deep-links to that card.
 *
 * The body is a child component on purpose. `open` belongs to `workspace-app`,
 * so there is no local open transition to hang a per-open reset off — but Radix
 * unmounts dialog content on close, so anything the body holds (the query, the
 * include-hidden switch) is gone by the next open. That is the reset (UNIT-20,
 * R6), derived from the mount rather than mirrored out of props by an effect.
 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" shouldFilter={false}>
      <SearchBody onOpenChange={onOpenChange} />
    </CommandDialog>
  );
}

function SearchBody({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  // Reveal cards from hidden projects, for this opening only — a sticky switch
  // would quietly undo the exclusion the user asked for by hiding the project.
  const [includeHidden, setIncludeHidden] = useState(false);
  const docs = useSearchDocs({ includeHidden });
  // The switch only exists on a board with something to reveal; a permanently
  // dead row is chrome for a state most boards never reach (DESIGN.md §7.5).
  const hasHiddenProjects = useArchivedProjects().length > 0;
  const openCard = useOpenCardNav();
  // Debounce ranking off the keystroke without lagging the input itself.
  const deferred = useDeferredValue(query);

  const results = useMemo(() => searchDocs(docs, deferred), [docs, deferred]);
  const recents = useMemo(() => recentDocs(docs), [docs]);
  const hasQuery = deferred.trim().length > 0;

  const pick = (doc: SearchDoc): void => {
    openCard(doc.cardId);
    onOpenChange(false);
  };

  return (
    <>
      <CommandInput
        placeholder="Search cards by title, ID, or label…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {hasQuery ? (
          <>
            <CommandEmpty>No matching cards.</CommandEmpty>
            {results.length > 0 ? (
              <CommandGroup heading="Cards">
                {results.map(({ doc }) => (
                  <CardResult key={doc.cardId} doc={doc} onPick={pick} />
                ))}
              </CommandGroup>
            ) : null}
          </>
        ) : recents.length > 0 ? (
          <CommandGroup heading="Recent">
            {recents.map((doc) => (
              <CardResult key={doc.cardId} doc={doc} onPick={pick} />
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>No cards yet. Create one to search.</CommandEmpty>
        )}

        {hasHiddenProjects ? (
          <IncludeHiddenItem checked={includeHidden} onToggle={() => setIncludeHidden((v) => !v)} />
        ) : null}
      </CommandList>
    </>
  );
}

/**
 * The per-open "reveal hidden-project cards" switch (UNIT-20, R5), rendered as
 * the palette's twin — same label, same `Eye`, same `aria-checked` on cmdk's own
 * `role="option"` (a supplied `role` is discarded), same `pr-7` check gutter.
 *
 * `forceMount` earns its place here for the mirror image of the palette's
 * reason: under `shouldFilter={false}` cmdk sets `filtered.count` to the number
 * of *registered* items and `CommandEmpty` renders only at zero, so an ordinary
 * row would hold the count at one and suppress "No matching cards." for good.
 * Force-mounted items are never registered. See DESIGN.md §7.5 and
 * `docs/solutions/integration-issues/cmdk-non-result-rows-in-the-two-palettes.md`.
 *
 * It sits *after* the results, unlike in ⌘K where an Actions group precedes it:
 * cmdk auto-selects the first row in the list, and this surface's primary path
 * is type-then-Enter on the top-ranked card. `onSelect` omits any close call, so
 * flipping the switch leaves the results it reveals on screen.
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

function CardResult({ doc, onPick }: { doc: SearchDoc; onPick: (doc: SearchDoc) => void }) {
  return (
    <CommandItem value={doc.cardId} onSelect={() => onPick(doc)}>
      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
      <span className="ml-2 shrink-0 truncate text-xs text-fg-faint">{doc.boardTitle}</span>
      <HiddenProjectMarker doc={doc} />
      <span className="ml-2 shrink-0 font-mono text-xs text-fg-faint">{doc.shortId}</span>
    </CommandItem>
  );
}
