"use client";

import type { Card, Label } from "@boardly/domain";
import { formatRelativeTime, isTerminalStatus, STATUS_META } from "@boardly/domain";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusIcon,
  type StatusVariant,
} from "@boardly/ui";
import { Archive, ArchiveRestore, ArrowLeft, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useArchivedCards, useBadgeConfig, useCardActions, useLabels } from "../../lib/use-board";
import { BadgeRow } from "../card/badge-row";
import { CardDetail } from "../card/card-detail";

/**
 * Full-area Archive view: every archived card, most-recently-archived first,
 * with Restore + Delete affordances. Replaces the board in the main area while
 * the `#archive` route is active (sibling of Settings). Rows open the shared
 * card-detail drawer via *local* state (not the ticket hash) so an archived card
 * — which the hash resolver, live-cards-only, cannot open — is still viewable
 * before restoring.
 */
export function ArchiveView({ onClose }: { onClose: () => void }) {
  const cards = useArchivedCards();
  const labels = useLabels();
  const config = useBadgeConfig();
  const actions = useCardActions();

  // Local (non-routed) open state — see the component note above.
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Card | null>(null);

  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  // The row shows a dedicated status glyph, so drop "status" from the badge row.
  const rowConfig = useMemo(() => config.filter((k) => k !== "status"), [config]);
  const now = Date.now();

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
        <button
          type="button"
          aria-label="Back to board"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-fg-muted transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">Archive</h1>
        {cards.length > 0 ? (
          <span className="text-xs tabular-nums text-fg-faint">{cards.length}</span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cards.length === 0 ? (
          <div className="grid h-full place-items-center p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Archive className="size-6 text-fg-faint" aria-hidden="true" />
              <p className="text-base text-fg-muted">No archived cards.</p>
              <p className="text-sm text-fg-faint">
                Archived cards are kept here so you can restore them later.
              </p>
            </div>
          </div>
        ) : (
          <ul role="list" className="flex flex-col">
            {cards.map((card) => (
              <ArchiveRow
                key={card.id}
                card={card}
                labelById={labelById}
                config={rowConfig}
                now={now}
                onOpen={() => setOpenId(card.id)}
                onRestore={() => actions.unarchive(card.id)}
                onDelete={() => setConfirmDelete(card)}
              />
            ))}
          </ul>
        )}
      </div>

      <CardDetail cardId={openId} onClose={() => setOpenId(null)} />

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete this card?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            This permanently deletes <span className="text-fg">{confirmDelete?.title}</span> and
            can&rsquo;t be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) actions.delete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ArchiveRow({
  card,
  labelById,
  config,
  now,
  onOpen,
  onRestore,
  onDelete,
}: {
  card: Card;
  labelById: Map<string, Label>;
  config: string[];
  now: number;
  onOpen: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const terminal = isTerminalStatus(card.status);
  const cardLabels = card.labelIds.map((id) => labelById.get(id)).filter((l): l is Label => !!l);
  return (
    <li className="group flex h-[37px] items-center gap-2 border-b border-line-subtle pl-4 pr-2 text-sm hover:bg-hover">
      {/* The main region opens the detail drawer; kept a real button (not a
          wrapping row) so the Restore/Delete controls aren't nested inside it. */}
      <button
        type="button"
        aria-label={`Open ${card.title}`}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <StatusIcon
          variant={card.status as StatusVariant}
          color={STATUS_META[card.status].color}
          className="shrink-0"
        />
        <span className="shrink-0 font-mono text-xs text-fg-faint">{card.shortId}</span>
        <span className={terminal ? "truncate text-fg-faint line-through" : "truncate text-fg"}>
          {card.title}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <BadgeRow card={card} labels={cardLabels} config={config} />
        {card.deletedAt ? (
          <span className="tabular-nums text-xs text-fg-faint" title="Archived">
            {formatRelativeTime(card.deletedAt, now)}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`Restore ${card.title}`}
          onClick={onRestore}
          className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <ArchiveRestore className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${card.title}`}
          onClick={onDelete}
          className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
