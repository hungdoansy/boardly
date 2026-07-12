"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { useDeferredValue, useMemo, useState } from "react";

import { useOpenCardNav } from "../../lib/use-boards";
import { recentDocs, searchDocs, type SearchDoc } from "./search-index";
import { useSearchDocs } from "./use-search";

/**
 * Instant fuzzy search across every board's cards. A cmdk palette with our own
 * ranking (`shouldFilter={false}`): empty query shows recents, a query shows
 * ranked matches, selecting a result deep-links to that card.
 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const docs = useSearchDocs();
  const openCard = useOpenCardNav();
  const [query, setQuery] = useState("");
  // Debounce ranking off the keystroke without lagging the input itself.
  const deferred = useDeferredValue(query);

  const results = useMemo(() => searchDocs(docs, deferred), [docs, deferred]);
  const recents = useMemo(() => recentDocs(docs), [docs]);
  const hasQuery = deferred.trim().length > 0;

  const pick = (doc: SearchDoc): void => {
    openCard(doc.cardId);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" shouldFilter={false}>
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
      </CommandList>
    </CommandDialog>
  );
}

function CardResult({ doc, onPick }: { doc: SearchDoc; onPick: (doc: SearchDoc) => void }) {
  return (
    <CommandItem value={doc.cardId} onSelect={() => onPick(doc)}>
      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
      <span className="ml-2 shrink-0 truncate text-xs text-fg-faint">{doc.boardTitle}</span>
      <span className="ml-2 shrink-0 font-mono text-xs text-fg-faint">{doc.shortId}</span>
    </CommandItem>
  );
}
