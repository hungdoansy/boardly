"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@boardly/ui";
import { PanelRight, Plus } from "lucide-react";
import { useState } from "react";

interface CardComposerProps {
  onAdd: (title: string) => void;
  /** Create a card (with the given title) and open its detail drawer, once confirmed. */
  onCreateDetailed?: (title: string) => void;
}

export function CardComposer({ onAdd, onCreateDetailed }: CardComposerProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [detailedDraft, setDetailedDraft] = useState("");

  const submit = (): void => {
    const title = draft.trim();
    if (title) {
      onAdd(title);
      setDraft(""); // keep the composer open for rapid entry
    }
  };

  const close = (): void => {
    setDraft("");
    setAdding(false);
  };

  const confirmDetailed = (): void => {
    const title = detailedDraft.trim();
    if (!title) return;
    onCreateDetailed?.(title);
    setDetailedDraft("");
    setDetailedOpen(false);
  };

  if (!adding) {
    return (
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          data-nav-composer
          onClick={() => setAdding(true)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="Add card"
          title="Add card"
        >
          <Plus className="size-3.5" />
        </button>
        {onCreateDetailed ? (
          <>
            <button
              type="button"
              aria-label="Add card with details"
              title="Add card with details"
              onClick={() => setDetailedOpen(true)}
              className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <PanelRight className="size-3.5" />
            </button>
            <Dialog
              open={detailedOpen}
              onOpenChange={(open) => {
                setDetailedOpen(open);
                if (!open) setDetailedDraft("");
              }}
            >
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Add card with details</DialogTitle>
                </DialogHeader>
                <Input
                  autoFocus
                  aria-label="New card title"
                  placeholder="Card title…"
                  value={detailedDraft}
                  onChange={(e) => setDetailedDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmDetailed();
                    }
                  }}
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDetailedOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmDetailed} disabled={!detailedDraft.trim()}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <input
      autoFocus
      data-nav-composer
      aria-label="New card title"
      placeholder="Card title…"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.key === "Escape") close();
      }}
      onBlur={close}
      className="w-full rounded-[var(--radius-md)] border border-[var(--accent)] bg-elevated px-2.5 py-2 text-base text-fg outline-none placeholder:text-fg-faint"
    />
  );
}
