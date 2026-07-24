import { describe, expect, it } from "vitest";

import { buildBoardHash, parseRoute } from "./route";

describe("parseRoute", () => {
  it("empty hash → All projects, no card, not settings/archive", () => {
    const empty = {
      settings: false,
      archive: false,
      projectRef: null,
      projectId: null,
      ticketNumber: null,
    };
    expect(parseRoute("")).toEqual(empty);
    expect(parseRoute("#")).toEqual(empty);
  });

  it("settings token → settings route only (archive false)", () => {
    expect(parseRoute("#settings")).toEqual({
      settings: true,
      archive: false,
      projectRef: null,
      projectId: null,
      ticketNumber: null,
    });
  });

  it("archive token → archive route only (settings false)", () => {
    expect(parseRoute("#archive")).toEqual({
      settings: false,
      archive: true,
      projectRef: null,
      projectId: null,
      ticketNumber: null,
    });
  });

  it("settings and archive are mutually exclusive across every route", () => {
    for (const hash of ["", "#", "#settings", "#archive", "#p/k3f9a2xq-web-app", "#BRD-42-x"]) {
      const r = parseRoute(hash);
      expect(r.settings && r.archive).toBe(false);
    }
    // A ticket ref that merely starts with "archive" is not the archive route.
    expect(parseRoute("#archive-1-x").archive).toBe(false);
  });

  it("project ref (<id>-<slug>) → raw ref + resolved id, no card", () => {
    expect(parseRoute("#p/k3f9a2xq-web-app")).toEqual({
      settings: false,
      archive: false,
      projectRef: "k3f9a2xq-web-app",
      projectId: "k3f9a2xq",
      ticketNumber: null,
    });
  });

  it("bare project id (no slug) resolves to itself", () => {
    expect(parseRoute("#p/k3f9a2xq")).toEqual({
      settings: false,
      archive: false,
      projectRef: "k3f9a2xq",
      projectId: "k3f9a2xq",
      ticketNumber: null,
    });
  });

  it("bare ticket ref → All scope + card", () => {
    expect(parseRoute("#BRD-42-fix-login")).toEqual({
      settings: false,
      archive: false,
      projectRef: null,
      projectId: null,
      ticketNumber: 42,
    });
  });

  it("project ref + ticket ref → both (id resolved, ticket by integer)", () => {
    expect(parseRoute("#p/k3f9a2xq-web-app/BRD-42-fix-login")).toEqual({
      settings: false,
      archive: false,
      projectRef: "k3f9a2xq-web-app",
      projectId: "k3f9a2xq",
      ticketNumber: 42,
    });
  });

  it("resolves the ticket by integer regardless of prefix/slug", () => {
    expect(parseRoute("#p/k3f9a2xq-web-app/OLD-42-stale").ticketNumber).toBe(42);
    expect(parseRoute("#42").ticketNumber).toBe(42);
  });

  it("does not mistake a ticket ref for a project segment", () => {
    // A board prefix of "p" still yields a hyphenated ref, never the bare "p".
    expect(parseRoute("#p-7-thing")).toEqual({
      settings: false,
      archive: false,
      projectRef: null,
      projectId: null,
      ticketNumber: 7,
    });
  });
});

describe("buildBoardHash", () => {
  it("round-trips a project ref through parseRoute", () => {
    expect(buildBoardHash(null)).toBe("");
    expect(buildBoardHash("k3f9a2xq-web-app")).toBe("p/k3f9a2xq-web-app");
    expect(buildBoardHash("k3f9a2xq-web-app", "BRD-9-x")).toBe("p/k3f9a2xq-web-app/BRD-9-x");
    expect(buildBoardHash(null, "BRD-9-x")).toBe("BRD-9-x");

    expect(parseRoute(`#${buildBoardHash("k3f9a2xq-web-app", "BRD-9-x")}`)).toEqual({
      settings: false,
      archive: false,
      projectRef: "k3f9a2xq-web-app",
      projectId: "k3f9a2xq",
      ticketNumber: 9,
    });
  });
});
