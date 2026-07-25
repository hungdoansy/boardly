"use client";

import { useEffect } from "react";

import { isEditableTarget } from "../../lib/is-editable-target";

/**
 * Keyboard-first board navigation.
 *
 * The "focus model" is intentionally *derived from the DOM*, not mirrored into
 * React state: the currently-focused item is whatever `document.activeElement`
 * is, and the board layout is read from `data-nav-*` attributes at keydown time.
 * This keeps focus in exactly one place (the DOM, where focus actually lives —
 * CLAUDE.md §3 "derive, don't synchronize") and stays correct as cards stream in
 * from Yjs without any subscription bookkeeping here.
 *
 * The pure functions (`moveFocus`, `initialFocus`, `focusAfterRemoval`) operate
 * on a plain {@link BoardLayout} and are unit-tested without a DOM.
 */

/** A focus position: a card, or a column header when `cardId` is null. */
export interface Focus {
  columnId: string;
  cardId: string | null;
}

/** Ordered column ids and, per column, its ordered card ids. */
export interface BoardLayout {
  columns: string[];
  cards: Record<string, string[]>;
}

export type NavDirection = "up" | "down" | "left" | "right";

const ARROW_TO_DIRECTION: Record<string, NavDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// ---------------------------------------------------------------------------
// Pure focus logic
// ---------------------------------------------------------------------------

/** First sensible focus for a board: first column's first card, else its header. */
export function initialFocus(layout: BoardLayout): Focus | null {
  const columnId = layout.columns[0];
  if (columnId === undefined) return null;
  const first = layout.cards[columnId]?.[0] ?? null;
  return { columnId, cardId: first };
}

/**
 * Compute the next focus for an arrow key, or `null` when the move is a no-op
 * (edges clamp — no wrapping). Up/Down walk a column's cards, stepping onto the
 * column header above the first card. Left/Right move to the adjacent column,
 * preserving the row index (clamped) or landing on the header when empty.
 */
export function moveFocus(layout: BoardLayout, focus: Focus, dir: NavDirection): Focus | null {
  const colIdx = layout.columns.indexOf(focus.columnId);
  if (colIdx === -1) return null;
  const cards = layout.cards[focus.columnId] ?? [];
  const cardIdx = focus.cardId === null ? -1 : cards.indexOf(focus.cardId);

  switch (dir) {
    case "down": {
      if (cardIdx + 1 < cards.length)
        return { columnId: focus.columnId, cardId: cards[cardIdx + 1]! };
      return null;
    }
    case "up": {
      if (cardIdx <= 0) return cardIdx === 0 ? { columnId: focus.columnId, cardId: null } : null;
      return { columnId: focus.columnId, cardId: cards[cardIdx - 1]! };
    }
    case "left":
    case "right": {
      const targetIdx = dir === "left" ? colIdx - 1 : colIdx + 1;
      const targetCol = layout.columns[targetIdx];
      if (targetCol === undefined) return null;
      const targetCards = layout.cards[targetCol] ?? [];
      if (focus.cardId === null || targetCards.length === 0) {
        return { columnId: targetCol, cardId: null };
      }
      const row = Math.min(cardIdx, targetCards.length - 1);
      return { columnId: targetCol, cardId: targetCards[row]! };
    }
  }
}

/** Where focus should land after the focused card is archived/removed. */
export function focusAfterRemoval(layout: BoardLayout, focus: Focus): Focus {
  if (focus.cardId === null) return focus;
  const cards = layout.cards[focus.columnId] ?? [];
  const idx = cards.indexOf(focus.cardId);
  if (idx !== -1 && idx + 1 < cards.length)
    return { columnId: focus.columnId, cardId: cards[idx + 1]! };
  if (idx > 0) return { columnId: focus.columnId, cardId: cards[idx - 1]! };
  return { columnId: focus.columnId, cardId: null };
}

// ---------------------------------------------------------------------------
// DOM adapters
// ---------------------------------------------------------------------------

/** Read the board layout from `data-nav-*` markup within `root`, in DOM order. */
export function readLayout(root: HTMLElement): BoardLayout {
  const columns: string[] = [];
  const cards: Record<string, string[]> = {};
  for (const col of root.querySelectorAll<HTMLElement>("[data-nav-column]")) {
    const id = col.getAttribute("data-nav-column");
    if (!id) continue;
    columns.push(id);
    cards[id] = Array.from(col.querySelectorAll<HTMLElement>('[data-nav="card"]'))
      .map((el) => el.getAttribute("data-card-id"))
      .filter((v): v is string => v !== null);
  }
  return { columns, cards };
}

/** The current focus, only when `document.activeElement` *is* a nav item. */
export function readFocus(): Focus | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return null;
  const columnId = el.getAttribute("data-column-id");
  if (el.dataset.nav === "card" && columnId) {
    return { columnId, cardId: el.getAttribute("data-card-id") };
  }
  if (el.dataset.nav === "column" && columnId) {
    return { columnId, cardId: null };
  }
  return null;
}

/** Focus a card element by id (used to restore focus after its detail closes). */
export function focusCard(root: HTMLElement, cardId: string): boolean {
  const el = root.querySelector<HTMLElement>(
    `[data-nav="card"][data-card-id="${CSS.escape(cardId)}"]`,
  );
  if (!el) return false;
  el.focus();
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function focusItem(root: HTMLElement, focus: Focus): boolean {
  const col = root.querySelector<HTMLElement>(`[data-nav-column="${CSS.escape(focus.columnId)}"]`);
  if (!col) return false;
  const target =
    focus.cardId === null
      ? col.querySelector<HTMLElement>('[data-nav="column"]')
      : col.querySelector<HTMLElement>(
          `[data-nav="card"][data-card-id="${CSS.escape(focus.cardId)}"]`,
        );
  if (!target) return false;
  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/** Open (or focus) the "add card" composer of a column. */
function openComposer(root: HTMLElement, columnId: string): void {
  const col = root.querySelector<HTMLElement>(`[data-nav-column="${CSS.escape(columnId)}"]`);
  const composer = col?.querySelector<HTMLElement>("[data-nav-composer]");
  if (composer instanceof HTMLInputElement) composer.focus();
  else composer?.click();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface KeyboardNavHandlers {
  onOpenCard: (cardId: string) => void;
  onArchiveCard: (cardId: string) => void;
  onCyclePriority: (cardId: string) => void;
}

/**
 * Install board keyboard navigation on `root`. Arrows rove focus; Enter opens
 * the focused card; `c` opens the column composer; `e` archives; `p` cycles
 * priority. Shortcuts are ignored while typing in a field, while a modifier is
 * held (so ⌘K etc. pass through), and while a dnd-kit keyboard drag is active
 * (the picked-up card reports `aria-pressed="true"`, and arrows belong to it).
 */
export function useBoardKeyboardNav(
  rootRef: React.RefObject<HTMLElement | null>,
  handlers: KeyboardNavHandlers,
): void {
  const { onOpenCard, onArchiveCard, onCyclePriority } = handlers;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const dir = ARROW_TO_DIRECTION[e.key];
      if (dir) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.getAttribute("aria-pressed") === "true") {
          return; // a keyboard drag owns the arrows
        }
        const layout = readLayout(root);
        const focus = readFocus();
        const next = focus ? moveFocus(layout, focus, dir) : initialFocus(layout);
        if (next && focusItem(root, next)) e.preventDefault();
        return;
      }

      const focus = readFocus();
      if (!focus) return;

      if (e.key === "Enter") {
        if (focus.cardId) {
          e.preventDefault();
          onOpenCard(focus.cardId);
        }
        return;
      }

      // e.code (physical key position) is used instead of e.key so these
      // single-letter shortcuts fire consistently on non-QWERTY/non-Latin layouts.
      if (e.code === "KeyC") {
        e.preventDefault();
        openComposer(root, focus.columnId);
        return;
      }
      if (e.code === "KeyE" && focus.cardId) {
        e.preventDefault();
        const next = focusAfterRemoval(readLayout(root), focus);
        onArchiveCard(focus.cardId);
        requestAnimationFrame(() => focusItem(root, next));
        return;
      }
      if (e.code === "KeyP" && focus.cardId) {
        e.preventDefault();
        onCyclePriority(focus.cardId);
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [rootRef, onOpenCard, onArchiveCard, onCyclePriority]);
}
