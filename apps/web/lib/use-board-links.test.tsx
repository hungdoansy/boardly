// @vitest-environment jsdom
import { createCard, createMemoryContext, execute, type MemoryContext } from "@boardly/commands";
import { Status } from "@boardly/domain";
import { getCard, initBoard } from "@boardly/sync";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "./boardly-context";
import { unfurl } from "./unfurl-client";
import { useLinkActions } from "./use-board";

// The network is mocked so we can observe the optimistic add independently of
// how fast (or whether) the unfurl resolves.
vi.mock("./unfurl-client", () => ({
  unfurl: vi.fn(),
  fetchGithubRepoDescription: vi.fn(),
}));

const mockUnfurl = vi.mocked(unfurl);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let ctx: MemoryContext;
let cardId: string;

function setup() {
  ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  cardId = execute(createCard, ctx, { status: Status.Todo, title: "Card" })!.id;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BoardlyProvider context={ctx}>{children}</BoardlyProvider>
  );
  return renderHook(() => useLinkActions(), { wrapper });
}

const links = () => getCard(ctx.getBoardDoc(), cardId)?.links ?? [];

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("useLinkActions.add (optimistic)", () => {
  it("adds a generic link immediately, before the unfurl resolves", async () => {
    const d = deferred<{ title?: string } | null>();
    mockUnfurl.mockReturnValue(d.promise);
    const { result } = setup();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.add(cardId, "https://zeitlabs.example.com/jobs/123");
    });

    // Persisted synchronously — the chip is present even though unfurl is still
    // pending (host label, no title yet).
    expect(links()).toHaveLength(1);
    expect(links()[0]!.title).toBeUndefined();

    // Now the unfurl resolves → the title is patched in.
    await act(async () => {
      d.resolve({ title: "Senior Frontend Engineer" });
      await pending;
    });
    await waitFor(() => expect(links()[0]!.title).toBe("Senior Frontend Engineer"));
  });

  it("keeps the link (no title) when the unfurl fails/returns null", async () => {
    mockUnfurl.mockResolvedValue(null);
    const { result } = setup();

    await act(async () => {
      await result.current.add(cardId, "https://example.com/x");
    });

    expect(links()).toHaveLength(1);
    expect(links()[0]!.title).toBeUndefined();
  });

  it("does not unfurl a provider whose label is derived from the URL", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.add(cardId, "https://linear.app/acme/issue/ABC-1");
    });

    expect(links()).toHaveLength(1);
    expect(mockUnfurl).not.toHaveBeenCalled();
  });

  it("DOES unfurl a brand-only provider — its label is a fixed word", async () => {
    // Regression: gated on `provider === Generic`, so a YouTube link never got
    // a title and the chip read the single word "YouTube".
    mockUnfurl.mockResolvedValue({ title: "Never Gonna Give You Up" });
    const { result } = setup();

    await act(async () => {
      await result.current.add(cardId, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    expect(mockUnfurl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(links()[0]?.title).toBe("Never Gonna Give You Up");
  });

  it("keeps the brand label when the brand-only unfurl yields nothing", async () => {
    mockUnfurl.mockResolvedValue({ title: undefined });
    const { result } = setup();

    await act(async () => {
      await result.current.add(cardId, "https://www.linkedin.com/jobs/view/1/");
    });

    expect(mockUnfurl).toHaveBeenCalled();
    expect(links()).toHaveLength(1);
    expect(links()[0]?.title).toBeUndefined();
  });
});
