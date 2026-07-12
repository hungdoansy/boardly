"use client";

import { formatTicketRef, parseTicketRef } from "@boardly/domain";
import { getBoard, getCard } from "@boardly/sync";
import { useCallback, useEffect, useState } from "react";

import { useBoardlyContext } from "./boardly-context";
import { useAllCards } from "./use-board";

// Single-board routing (static-export friendly): the URL hash names only the
// open ticket, Linear-style — `#TEC-42-fix-login` or, with an empty prefix,
// `#42-fix-login`. There is exactly one board (the per-user doc), so it is
// implicit. The hash resolves by its integer; the prefix and slug are cosmetic
// (a stale prefix or edited title still opens the right card). An empty hash
// means no card open.

/** The ticket number named by the URL hash, reactive to hashchange. */
function useHashTicketNumber(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      const ref = window.location.hash.replace(/^#/, "");
      setN(ref ? parseTicketRef(ref) : null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return n;
}

/** Write (or clear) the Linear-style ticket hash for a card on the per-user board. */
function writeCardHash(ctx: ReturnType<typeof useBoardlyContext>, cardId: string): void {
  const doc = ctx.getBoardDoc();
  const card = getCard(doc, cardId);
  if (!card) {
    window.location.hash = "";
    return;
  }
  window.location.hash = formatTicketRef(
    getBoard(doc, ctx.userId ?? "").shortIdPrefix,
    card.number,
    card.title,
  );
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
        window.location.hash = "";
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = (): void => setOpen(window.location.hash.replace(/^#/, "") === "settings");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const set = useCallback((next: boolean) => {
    window.location.hash = next ? "settings" : "";
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
