"use client";

import { formatTicketRef, parseTicketRef } from "@boardly/domain";
import { addColumn, execute } from "@boardly/commands";
import { getBoard, getCard, initBoard, liveColumns } from "@boardly/sync";
import { getBoardDoc } from "@boardly/sync/client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthSession } from "./auth-store";
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

/** Columns the interim seed provisions on a brand-new board. */
const DEFAULT_COLUMNS = ["To Do", "Doing", "Done"];
const DEFAULT_BOARD_TITLE = "Main board";

/**
 * INTERIM (removed in Unit 9, when columns become fixed statuses): the board
 * layer no longer provisions or seeds — an empty per-user doc is a valid empty
 * board. But until columns are the fixed status set, a brand-new user needs at
 * least one column to place cards. This seeds the board's meta (title + default
 * badge config) and the To Do/Doing/Done columns exactly once — only after
 * local IndexedDB has hydrated (so we don't seed over persisted content) and
 * only when the doc has zero columns.
 */
export function useSeedDefaultBoard(): void {
  const ctx = useBoardlyContext();
  const { userId } = useAuthSession();
  const seeding = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    void getBoardDoc(userId).whenSynced.then(() => {
      if (mounted) setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated || seeding.current) return;
    const doc = ctx.getBoardDoc();
    if (liveColumns(doc).length > 0) return;
    seeding.current = true;
    // initBoard is idempotent (guards on `createdAt`); seeds title + badge config.
    initBoard(doc, { title: DEFAULT_BOARD_TITLE, now: Date.now() });
    for (const title of DEFAULT_COLUMNS) execute(addColumn, ctx, { title });
  }, [hydrated, ctx]);
}
