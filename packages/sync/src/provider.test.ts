import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { attachNetwork, boardDocName, workspaceDocName, type DocHandle } from "./provider";

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
  it("builds server document names distinct from local rooms", () => {
    expect(boardDocName("b1")).toBe("board:b1");
    expect(workspaceDocName("u1")).toBe("workspace:u1");
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
