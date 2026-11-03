// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseUnfurl, unfurl } from "./unfurl-client";

const tauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => tauriFetch(...args) }));

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  tauriFetch.mockReset();
  vi.restoreAllMocks();
});

describe("parseUnfurl", () => {
  it("extracts <title> (entity-decoded) and resolves a relative favicon", () => {
    const u = parseUnfurl(
      '<html><head><title>Hello &amp; Bye</title><link rel="icon" href="/fav.png"></head></html>',
      "https://example.com/page",
    );
    expect(u.title).toBe("Hello & Bye");
    expect(u.iconUrl).toBe("https://example.com/fav.png");
  });

  it("prefers og:title and defaults the favicon to /favicon.ico", () => {
    const u = parseUnfurl(
      '<meta property="og:title" content="OG Title" /><title>fallback</title>',
      "https://x.io/a/b",
    );
    expect(u.title).toBe("OG Title");
    expect(u.iconUrl).toBe("https://x.io/favicon.ico");
  });

  it("decodes numeric entities, which the old local table passed through raw", () => {
    const u = parseUnfurl("<title>CH&#x1ee2; GAMING GEAR</title>", "https://example.com/");
    expect(u.title).toBe("CHỢ GAMING GEAR");
  });

  it("drops an interstitial title so the chip keeps its short label", () => {
    expect(
      parseUnfurl("<title>Just a moment...</title>", "https://claude.ai/chat/x").title,
    ).toBeUndefined();
    expect(
      parseUnfurl("<title>Not Found</title>", "https://example.com/gone").title,
    ).toBeUndefined();
  });

  it("entity-decodes the favicon href", () => {
    const u = parseUnfurl(
      '<link rel="icon" href="/i.png?a=1&amp;b=2"><title>T</title>',
      "https://example.com/",
    );
    expect(u.iconUrl).toBe("https://example.com/i.png?a=1&b=2");
  });

  it("drops a title that only repeats the provider's short label", () => {
    const u = parseUnfurl("<title>YouTube</title>", "https://www.youtube.com/watch?v=abc");
    expect(u.title).toBeUndefined();
  });
});

describe("unfurl platform switch", () => {
  it("uses the web /api/unfurl endpoint on web", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ title: "Web" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await unfurl("https://example.com");
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/unfurl?url="));
    expect(tauriFetch).not.toHaveBeenCalled();
    expect(r?.title).toBe("Web");
  });

  it("uses the Tauri native fetch (no server round-trip) under Tauri", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    tauriFetch.mockResolvedValue(new Response("<title>Native</title>", { status: 200 }));
    const webFetch = vi.spyOn(globalThis, "fetch");
    const r = await unfurl("https://example.com");
    expect(tauriFetch).toHaveBeenCalled();
    expect(webFetch).not.toHaveBeenCalled();
    expect(r?.title).toBe("Native");
  });

  it("returns null for non-http(s) urls without any fetch", async () => {
    const webFetch = vi.spyOn(globalThis, "fetch");
    expect(await unfurl("javascript:alert(1)")).toBeNull();
    expect(webFetch).not.toHaveBeenCalled();
  });

  it("under Tauri, refuses to fetch a private/loopback host (SSRF guard)", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(await unfurl("https://192.168.1.1/admin")).toBeNull();
    expect(await unfurl("http://example.com")).toBeNull(); // plaintext blocked on desktop
    expect(tauriFetch).not.toHaveBeenCalled();
  });
});
