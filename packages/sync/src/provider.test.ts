import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { attachNetwork, boardDocName, getBoardDoc, type DocHandle } from "./provider";
import { boardCards } from "./schema";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeHandle(whenSynced: Promise<void>): DocHandle {
  return { doc: new Y.Doc(), room: "boardly:board:b1", whenSynced, destroy: () => {} };
}

describe("doc names", () => {
  it("builds the per-user server document name distinct from the local room", () => {
    expect(boardDocName("u1")).toBe("board:u1");
  });
});

describe("getBoardDoc (per-user content doc)", () => {
  it("returns distinct docs per user id; content in one is absent from the other", () => {
    const u1 = getBoardDoc("u1");
    const u2 = getBoardDoc("u2");
    expect(u1.doc).not.toBe(u2.doc);
    expect(u1.room).toBe("boardly:board:u1");
    expect(u2.room).toBe("boardly:board:u2");

    boardCards(u1.doc).set("c1", new Y.Map<unknown>());
    expect(boardCards(u1.doc).has("c1")).toBe(true);
    expect(boardCards(u2.doc).has("c1")).toBe(false);

    u1.destroy();
    u2.destroy();
  });

  it("returns the same shared handle for repeated calls with the same user id", () => {
    const a = getBoardDoc("same-user");
    const b = getBoardDoc("same-user");
    expect(a.doc).toBe(b.doc);
    a.destroy();
  });
});

describe("attachNetwork", () => {
  it("does not connect until local sync has completed (no content flash)", async () => {
    const gate = deferred();
    const createProvider = vi.fn(() => ({ destroy: vi.fn() }));
    const handle = fakeHandle(gate.promise);

    const attaching = attachNetwork(handle, {
      documentName: "board:b1",
      url: "ws://x/sync",
      getTicket: vi.fn().mockResolvedValue("ticket-1"),
      createProvider,
    });

    // Still hydrating locally → provider must not exist yet.
    await Promise.resolve();
    expect(createProvider).not.toHaveBeenCalled();

    gate.resolve();
    await attaching;
    expect(createProvider).toHaveBeenCalledOnce();
  });

  it("passes the doc/name/url and a token that mints a fresh ticket each call", async () => {
    let captured: {
      name: string;
      url: string;
      token: () => Promise<string>;
      document: Y.Doc;
    } | null = null;
    const createProvider = vi.fn((cfg) => {
      captured = cfg;
      return { destroy: vi.fn() };
    });
    const getTicket = vi.fn().mockResolvedValue("ticket-x");
    const handle = fakeHandle(Promise.resolve());

    await attachNetwork(handle, {
      documentName: "board:b1",
      url: "ws://x/sync",
      getTicket,
      createProvider,
    });

    expect(captured!.name).toBe("board:b1");
    expect(captured!.url).toBe("ws://x/sync");
    expect(captured!.document).toBe(handle.doc);

    // The token function re-mints on every (re)connect.
    expect(await captured!.token()).toBe("ticket-x");
    expect(await captured!.token()).toBe("ticket-x");
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(getTicket).toHaveBeenCalledWith("board:b1");
  });

  it("returns a handle whose destroy tears down the provider", async () => {
    const destroy = vi.fn();
    const createProvider = vi.fn(() => ({ destroy }));
    const net = await attachNetwork(fakeHandle(Promise.resolve()), {
      documentName: "board:b1",
      url: "ws://x/sync",
      getTicket: vi.fn().mockResolvedValue("t"),
      createProvider,
    });
    net.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
