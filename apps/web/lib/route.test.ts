import { describe, expect, it } from "vitest";

import { buildBoardHash, parseRoute } from "./route";

describe("parseRoute", () => {
  it("empty hash → All projects, no card, not settings", () => {
    expect(parseRoute("")).toEqual({ settings: false, projectId: null, ticketNumber: null });
    expect(parseRoute("#")).toEqual({ settings: false, projectId: null, ticketNumber: null });
  });

  it("settings token → settings route only", () => {
    expect(parseRoute("#settings")).toEqual({
      settings: true,
      projectId: null,
      ticketNumber: null,
    });
  });

  it("project segment → project scope, no card", () => {
    expect(parseRoute("#p/proj-123")).toEqual({
      settings: false,
      projectId: "proj-123",
      ticketNumber: null,
    });
  });

  it("bare ticket ref → All scope + card", () => {
    expect(parseRoute("#BRD-42-fix-login")).toEqual({
      settings: false,
      projectId: null,
      ticketNumber: 42,
    });
  });

  it("project segment + ticket ref → both", () => {
    expect(parseRoute("#p/proj-123/BRD-42-fix-login")).toEqual({
      settings: false,
      projectId: "proj-123",
      ticketNumber: 42,
    });
  });

  it("resolves the ticket by integer regardless of prefix/slug", () => {
    expect(parseRoute("#p/proj-123/OLD-42-stale").ticketNumber).toBe(42);
    expect(parseRoute("#42").ticketNumber).toBe(42);
  });

  it("does not mistake a ticket ref for a project segment", () => {
    // A board prefix of "p" still yields a hyphenated ref, never the bare "p".
    expect(parseRoute("#p-7-thing")).toEqual({
      settings: false,
      projectId: null,
      ticketNumber: 7,
    });
  });
});

describe("buildBoardHash", () => {
  it("round-trips through parseRoute", () => {
    expect(buildBoardHash(null)).toBe("");
    expect(buildBoardHash("proj-1")).toBe("p/proj-1");
    expect(buildBoardHash("proj-1", "BRD-9-x")).toBe("p/proj-1/BRD-9-x");
    expect(buildBoardHash(null, "BRD-9-x")).toBe("BRD-9-x");

    expect(parseRoute(`#${buildBoardHash("proj-1", "BRD-9-x")}`)).toEqual({
      settings: false,
      projectId: "proj-1",
      ticketNumber: 9,
    });
  });
});
