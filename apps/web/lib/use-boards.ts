"use client";

import { formatTicketRef } from "@boardly/domain";
import { getBoard, getCard } from "@boardly/sync";
import { useCallback, useSyncExternalStore } from "react";

import { useBoardlyContext } from "./boardly-context";
import {
  buildBoardHash,
  currentHashBody,
  parseRoute,
  subscribeRoute,
  writeHashBody,
} from "./route";
import { useAllCards } from "./use-board";

// Single-board routing (static-export friendly): the URL hash encodes the open
// ticket, Linear-style — `#TEC-42-fix-login` or, with an empty prefix,
// `#42-fix-login` — optionally under a project segment (`#p/<id>/TEC-42-…`) so
// the scoped board is preserved while a card is open. There is exactly one board
// (the per-user doc), so it is implicit. The hash resolves by its integer; the
// prefix and slug are cosmetic (a stale prefix or edited title still opens the
// right card). See route.ts for the full grammar.

/** The ticket number named by the URL hash, reactive to route changes. */
function useHashTicketNumber(): number | null {
  return useSyncExternalStore(
    subscribeRoute,
    () => parseRoute(currentHashBody()).ticketNumber,
    () => null,
  );
}

/**
 * The Linear-style hash body (no leading `#`) that opens `cardId`, preserving
 * the current project scope segment. Falls back to the scoped board when the
 * card is gone. Shared by the ticket-hash writer and the "Copy link" action.
 */
export function cardHashBody(ctx: ReturnType<typeof useBoardlyContext>, cardId: string): string {
  const doc = ctx.getBoardDoc();
  const { projectRef } = parseRoute(currentHashBody());
  const card = getCard(doc, cardId);
  if (!card) return buildBoardHash(projectRef);
  const ref = formatTicketRef(getBoard(doc, ctx.userId ?? "").shortIdPrefix, card.number, card.title);
  return buildBoardHash(projectRef, ref);
}

/** Absolute URL to a card (origin + path + ticket hash) — for copy-to-clipboard. */
export function buildCardHref(ctx: ReturnType<typeof useBoardlyContext>, cardId: string): string {
  const base =
    typeof window === "undefined" ? "" : window.location.origin + window.location.pathname;
  return `${base}#${cardHashBody(ctx, cardId)}`;
}

/**
 * Write (or clear) the Linear-style ticket hash for a card, keeping the current
 * project scope segment so closing the card returns to the same scoped board.
 */
function writeCardHash(ctx: ReturnType<typeof useBoardlyContext>, cardId: string): void {
  writeHashBody(cardHashBody(ctx, cardId));
}

/**
 * The open card id (uuid) for the per-user board plus a setter, bridged to the
 * Linear-style ticket hash. Reads resolve the hash's integer to a card id over
 * the live card list; the setter serializes a card id back to `PREFIX-N-slug`.
 */
export function useSelectedCard(): [string | null, (cardId: string | null) => void] {
  const ctx = useBoardlyContext();
  const number = useHashTicketNumber();
  const cards = useAllCards();
  const cardId = number != null ? (cards.find((c) => c.number === number)?.id ?? null) : null;

  const setCard = useCallback(
    (next: string | null) => {
      if (!next) {
        // Closing a card returns to the board at its current project scope.
        writeHashBody(buildBoardHash(parseRoute(currentHashBody()).projectRef));
        return;
      }
      writeCardHash(ctx, next);
    },
    [ctx],
  );
  return [cardId, setCard];
}

/**
 * Whether the settings view is open (hash `#settings`) + a setter. Settings is a
 * distinct route from an open ticket; opening it clears any open card.
 */
export function useSettingsRoute(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribeRoute,
    () => parseRoute(currentHashBody()).settings,
    () => false,
  );
  const set = useCallback((next: boolean) => {
    writeHashBody(next ? "settings" : "");
  }, []);
  return [open, set];
}

/** Open a specific card by id (used by search/palette) on the per-user board. */
export function useOpenCardNav(): (cardId: string) => void {
  const ctx = useBoardlyContext();
  return useCallback((cardId: string) => writeCardHash(ctx, cardId), [ctx]);
}

// NOTE: the client deliberately does NOT seed default board meta. Columns are
// the fixed status set (STATUS_ORDER), so a brand-new user boots straight to
// eight empty status columns; the board's non-column defaults (title fallback,
// default badge face, empty ticket prefix, showEmptyColumns=true) are supplied
// at READ time by `boardToPlain`/the title fallback. Writing defaults from the
// client was removed because, on a device with an empty local cache opening an
// already-persisted board, the write landed before the server sync and its
// newer last-writer-wins timestamp clobbered the board's real title/prefix/
// badge config (breaking multi-device durability).
