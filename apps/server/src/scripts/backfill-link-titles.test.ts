import { describe, expect, it, vi } from "vitest";

import {
  needsTitle,
  planTargets,
  resolveTitle,
  type FetchTitle,
  type Snapshot,
  type Target,
} from "./backfill-link-titles";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("needsTitle", () => {
  it("wants a title when there is none, or the stored one is junk", () => {
    expect(needsTitle(YT, undefined)).toBe(true);
    expect(needsTitle("https://www.facebook.com/x", "CH&#x1ee2; GAMING GEAR")).toBe(true);
    expect(needsTitle("https://example.com/a", "Just a moment...")).toBe(true);
    expect(needsTitle("https://www.linkedin.com/jobs/view/1/", "LinkedIn")).toBe(true);
  });

  it("treats the old route's hostname fallback as no title", () => {
    expect(needsTitle("https://www.behance.net/gallery/1", "www.behance.net")).toBe(true);
    expect(needsTitle("https://www.behance.net/gallery/1", "behance.net")).toBe(true);
  });

  it("leaves a real title alone", () => {
    expect(needsTitle(YT, "Never Gonna Give You Up")).toBe(false);
  });
});

describe("planTargets", () => {
  const snapshot: Snapshot = {
    cards: [
      {
        id: "c1",
        title: "Card",
        links: [
          { id: "yt", url: YT },
          { id: "good", url: "https://example.com/a", title: "A real page" },
          { id: "gh", url: "https://github.com/o/r/pull/1" }, // derived label: never unfurled
          { id: "claude", url: "https://claude.ai/code/session_1" }, // opts out of unfurl
          { id: "js", url: "javascript:alert(1)" },
        ],
      },
    ],
  };

  it("targets only unfurlable links that lack a good title", () => {
    expect(planTargets(snapshot).map((t) => t.linkId)).toEqual(["yt"]);
  });

  it("with all, re-checks unfurlable links that already have a title", () => {
    expect(planTargets(snapshot, { all: true }).map((t) => t.linkId)).toEqual(["yt", "good"]);
  });
});

describe("resolveTitle", () => {
  const target = (oldTitle?: string, url = YT): Target => ({
    cardId: "c1",
    cardTitle: "Card",
    linkId: "l1",
    url,
    oldTitle,
  });
  const returning =
    (result: Awaited<ReturnType<FetchTitle>>): FetchTitle =>
    async () =>
      result;

  it("updates to a fetched title", async () => {
    await expect(resolveTitle(target(), returning({ title: "Rick Astley" }))).resolves.toEqual({
      kind: "update",
      title: "Rick Astley",
      via: "fetch",
    });
  });

  it("reports unchanged when the page title matches what is stored", async () => {
    await expect(resolveTitle(target("Same"), returning({ title: "Same" }))).resolves.toEqual({
      kind: "unchanged",
    });
  });

  it("keeps the current title when the page is unreachable", async () => {
    const fetchTitle = vi.fn(returning({ reason: "unreachable or non-2xx" }));
    await expect(resolveTitle(target("www.behance.net"), fetchTitle)).resolves.toEqual({
      kind: "kept",
      reason: "unreachable or non-2xx",
    });
    await expect(resolveTitle(target(), fetchTitle)).resolves.toMatchObject({ kind: "kept" });
  });

  it("repairs raw entities locally when the fetch yields nothing", async () => {
    const outcome = await resolveTitle(
      target("CH&#x1ee2; GAMING GEAR", "https://www.facebook.com/x"),
      returning({ reason: "unreachable or non-2xx" }),
    );
    expect(outcome).toEqual({ kind: "update", title: "CHỢ GAMING GEAR", via: "decode" });
  });
});
