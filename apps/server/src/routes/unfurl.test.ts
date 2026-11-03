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

  it("decodes numeric HTML entities in the title", () => {
    // Regression: the old six-entry entity table left these raw on the card.
    const html = `<html><head><title>CH&#x1ee2; GAMING GEAR: PH&#xcd;M C&#x1a0;</title></head></html>`;
    expect(parseMetadata(html, "https://example.com/").title).toBe("CHỢ GAMING GEAR: PHÍM CƠ");
  });

  it("drops an interstitial or error-page title so the chip keeps its short label", () => {
    for (const bad of ["Just a moment...", "Security Check | Wellfound", "404: Page not found"]) {
      const html = `<html><head><title>${bad}</title></head></html>`;
      expect(parseMetadata(html, "https://example.com/x").title, bad).toBeUndefined();
    }
  });

  it("entity-decodes the icon href, so a query-string og:image stays usable", () => {
    // Regression: Vimeo's og:image came back with a literal `&amp;amp;`.
    const html = `<meta property="og:image" content="https://cdn.example.com/i.webp?f=webp&amp;region=us">`;
    expect(parseMetadata(html, "https://example.com/").iconUrl).toBe(
      "https://cdn.example.com/i.webp?f=webp&region=us",
    );
  });

  it("drops a title that only repeats the provider's own short label", () => {
    const html = `<html><head><title>LinkedIn</title></head></html>`;
    expect(parseMetadata(html, "https://www.linkedin.com/jobs/view/1/").title).toBeUndefined();
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

  it("returns no title when the fetch fails (no 500, no hostname)", async () => {
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
      // Not the hostname: a brand-only chip would read "www.linkedin.com"
      // instead of "LinkedIn". The client keeps the short label instead.
      expect(res.json()).toEqual({});
    } finally {
      await app.close();
    }
  });

  it("returns no title for a non-2xx answer (a bot-blocked brand-only page)", async () => {
    const url = `https://www.behance.net/gallery/${randomUUID()}`;
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({});
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

  it("finds metadata past the old 512 KB read cap (large SPA shells)", async () => {
    // YouTube's watch page is ~1.39 MB with its <head> at ~760 KB; the previous
    // 512 KB cap truncated the body first and every such link fell back to the
    // hostname.
    const url = `https://big.example.com/${randomUUID()}`;
    const padding = `<!--${"x".repeat(700 * 1024)}-->`;
    const fetchImpl = vi.fn(async () =>
      htmlResponse(`<html>${padding}<head><title>Deep Title</title></head><body></body></html>`),
    );
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(res.json()).toMatchObject({ title: "Deep Title" });
    } finally {
      await app.close();
    }
  });

  it("stops reading at </head> instead of buffering the whole body", async () => {
    const url = `https://early.example.com/${randomUUID()}`;
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new TextEncoder().encode("<html><head><title>Early</title></head>"));
          return;
        }
        // Pulled only if the reader kept going past </head>.
        controller.enqueue(new TextEncoder().encode("<body>never read</body>"));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const app = await appWith(fetchImpl as unknown as typeof fetch);
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/unfurl?url=${encodeURIComponent(url)}`,
      });
      expect(res.json()).toMatchObject({ title: "Early" });
      // Cancellation is the proof: a read that ran to EOF would never cancel.
      // (`pulls` is 2, not 1 — a ReadableStream pre-pulls one chunk ahead of
      // the reader, so it is not a usable signal here.)
      expect(cancelled).toBe(true);
      expect(pulls).toBeLessThanOrEqual(2);
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
