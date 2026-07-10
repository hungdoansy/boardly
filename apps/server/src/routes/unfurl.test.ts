import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import {
  assertFetchableUrl,
  isBlockedIp,
  normalizeUrl,
  parseMetadata,
  UnfurlBlockedError,
  type DnsLookup,
} from "./unfurl";

// ---------------------------------------------------------------------------
// SSRF guard (pure)
// ---------------------------------------------------------------------------

describe("isBlockedIp", () => {
  it("blocks loopback / private / link-local / reserved", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.3.4",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("normalizeUrl", () => {
  it("drops the fragment and rejects non-http(s)", () => {
    expect(normalizeUrl("https://example.com/a#frag").href).toBe("https://example.com/a");
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(UnfurlBlockedError);
    expect(() => normalizeUrl("data:text/html,x")).toThrow(UnfurlBlockedError);
    expect(() => normalizeUrl("not a url")).toThrow(UnfurlBlockedError);
  });
});

describe("assertFetchableUrl", () => {
  const lookupTo =
    (address: string): DnsLookup =>
    async () => [{ address, family: isIP4(address) }];
  const isIP4 = (a: string): number => (a.includes(":") ? 6 : 4);

  it("rejects a hostname that resolves to a private address", async () => {
    await expect(
      assertFetchableUrl(new URL("http://internal.example/"), lookupTo("10.0.0.9")),
    ).rejects.toBeInstanceOf(UnfurlBlockedError);
  });

  it("rejects a literal blocked IP without resolving", async () => {
    const lookup = vi.fn<DnsLookup>();
    await expect(
      assertFetchableUrl(new URL("http://169.254.169.254/"), lookup),
    ).rejects.toBeInstanceOf(UnfurlBlockedError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a host that resolves to a public address", async () => {
    await expect(
      assertFetchableUrl(new URL("https://example.com/"), lookupTo("93.184.216.34")),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HTML parsing (pure)
// ---------------------------------------------------------------------------

describe("parseMetadata", () => {
  it("prefers og:title and resolves the favicon link", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta property="og:title" content="Real &amp; Title" />
      <link rel="icon" href="/fav.png" />
    </head></html>`;
    expect(parseMetadata(html, "https://example.com/page")).toEqual({
      title: "Real & Title",
      iconUrl: "https://example.com/fav.png",
    });
  });

  it("falls back to <title> and /favicon.ico", () => {
    const html = `<html><head><title>Just Title</title></head></html>`;
    expect(parseMetadata(html, "https://example.com/deep/path")).toEqual({
      title: "Just Title",
      iconUrl: "https://example.com/favicon.ico",
    });
  });
});

// ---------------------------------------------------------------------------
// Route (real db, mocked fetch/lookup)
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe.skipIf(!DATABASE_URL)("GET /api/unfurl (integration, real db)", () => {
  let handle: DbHandle;
  const publicLookup: DnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  // buildServer wires unfurl with default deps; for injectable fetch/lookup we
  // register the plugin directly on a bare Fastify app.
  async function appWith(fetchImpl: typeof fetch, lookup: DnsLookup = publicLookup) {
    const { default: Fastify } = await import("fastify");
    const { unfurlRoutes } = await import("./unfurl");
    const app = Fastify({ logger: false });
    await app.register(unfurlRoutes, { db: handle.db, fetchImpl, lookup });
    await app.ready();
    return app;
  }

  it("returns title+icon, then serves the second call from cache", async () => {
    const url = `https://example.com/${randomUUID()}`;
    const fetchImpl = vi.fn(async () =>
      htmlResponse(`<title>Example</title><link rel="icon" href="/icon.png">`),
    );
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      const first = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        title: "Example",
        iconUrl: "https://example.com/icon.png",
      });

      const second = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(second.json()).toMatchObject({ title: "Example" });
      expect(fetchImpl).toHaveBeenCalledTimes(1); // second served from cache
    } finally {
      await app.close();
    }
  });

  it("falls back to the hostname when the fetch fails (no 500)", async () => {
    const url = `https://down.example.com/${randomUUID()}`;
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ title: "down.example.com" });
    } finally {
      await app.close();
    }
  });

  it("rejects a literal private/loopback target (SSRF) with 400 and never fetches", async () => {
    const fetchImpl = vi.fn();
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      for (const url of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:5433/"]) {
        const res = await app.inject({
          method: "GET",
          url: `/api/unfurl?url=${encodeURIComponent(url)}`,
        });
        expect(res.statusCode).toBe(400);
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejects a host that resolves to a private address (SSRF via DNS)", async () => {
    const fetchImpl = vi.fn();
    const app = await appWith(fetchImpl as unknown as typeof fetch, async () => [
      { address: "10.1.2.3", family: 4 },
    ]);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent("http://intranet.example/")}`,
      });
      expect(res.statusCode).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejects a non-http scheme with 400", async () => {
    const app = await appWith(vi.fn() as unknown as typeof fetch);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent("ftp://example.com/x")}`,
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
