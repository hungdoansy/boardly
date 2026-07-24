// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { archiveCard, createCard, createMemoryContext, execute } from "@boardly/commands";
import { initBoard } from "@boardly/sync";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "./boardly-context";
import { useArchivedCards, useCardActions } from "./use-board";
import { useArchiveRoute, useOpenCardNav, useSelectedCard } from "./use-boards";

function seed() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Main board", now: 0 });
  const card = execute(createCard, ctx, {
    title: "Fix the login bug",
  })!;
  return { ctx, cardId: card.id };
}

/** Fire a hashchange the way a real navigation would (jsdom doesn't auto-fire it). */
function emitHashChange() {
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => cleanup());

describe("ticket deep-link routing (single board)", () => {
  it("writes a Linear-style hash and resolves it back to the card id", () => {
    const { ctx, cardId } = seed();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
    );

    const { result } = renderHook(() => ({ open: useOpenCardNav(), selected: useSelectedCard() }), {
      wrapper,
    });

    // Write path: opening card #1 (empty prefix) produces "#1-<slug>".
    act(() => result.current.open(cardId));
    expect(window.location.hash).toBe("#1-fix-the-login-bug");

    // Read path: the hash resolves back to the same card id by integer.
    emitHashChange();
    expect(result.current.selected[0]).toBe(cardId);
  });

  it("resolves by integer even when the slug/prefix in the URL is stale", () => {
    const { ctx, cardId } = seed();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
    );
    const { result } = renderHook(() => useSelectedCard(), { wrapper });

    // A hand-edited/legacy URL with a different prefix + slug still opens card 1.
    act(() => {
      window.location.hash = "#OLD-1-something-else";
    });
    emitHashChange();
    expect(result.current[0]).toBe(cardId);
  });

  it("clears the hash and resolves to no card when closed", () => {
    const { ctx, cardId } = seed();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
    );
    const { result } = renderHook(() => useSelectedCard(), { wrapper });

    act(() => result.current[1](cardId));
    emitHashChange();
    expect(result.current[0]).toBe(cardId);

    act(() => result.current[1](null));
    emitHashChange();
    expect(window.location.hash).toBe("");
    expect(result.current[0]).toBeNull();
  });
});

describe("useArchiveRoute", () => {
  it("is false initially, opens #archive, and clears it", () => {
    const { ctx } = seed();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
    );
    const { result } = renderHook(() => useArchiveRoute(), { wrapper });

    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    emitHashChange();
    expect(window.location.hash).toBe("#archive");
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    emitHashChange();
    expect(window.location.hash).toBe("");
    expect(result.current[0]).toBe(false);
  });
});

describe("useArchivedCards", () => {
  it("reflects a card archived then restored", () => {
    const { ctx, cardId } = seed();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
    );
    const { result } = renderHook(
      () => ({ archived: useArchivedCards(), actions: useCardActions() }),
      { wrapper },
    );

    expect(result.current.archived).toEqual([]);

    act(() => execute(archiveCard, ctx, { cardId }));
    expect(result.current.archived.map((c) => c.id)).toEqual([cardId]);

    act(() => result.current.actions.unarchive(cardId));
    expect(result.current.archived).toEqual([]);
  });
});
