import { describe, expect, it } from "vitest";

import { LinkProvider } from "../enums";
import {
  detectProvider,
  isPublicHttpUrl,
  isSafeHttpUrl,
  normalizeUrl,
  shortLabelFor,
} from "./registry";

describe("detectProvider", () => {
  it("maps each shipped provider", () => {
    expect(detectProvider("https://acme.slack.com/archives/C0/p1")).toBe(LinkProvider.Slack);
    expect(detectProvider("https://linear.app/acme/issue/ABC-123/x")).toBe(LinkProvider.Linear);
    expect(detectProvider("https://github.com/o/r/pull/123")).toBe(LinkProvider.GitHub);
    expect(detectProvider("https://github.com/o/r/issues/123")).toBe(LinkProvider.GitHub);
    expect(detectProvider("https://claude.ai/code/session_abc")).toBe(LinkProvider.Claude);
    expect(detectProvider("https://example.com/page")).toBe(LinkProvider.Generic);
  });

  it("falls back to generic on malformed/relative urls", () => {
    expect(detectProvider("not a url")).toBe(LinkProvider.Generic);
    expect(detectProvider("/relative")).toBe(LinkProvider.Generic);
  });

  it("does not let generic shadow a github repo url", () => {
    // A github.com URL that is neither pull nor issue still resolves to generic
    // (no specific matcher), proving ordering is by specificity + generic last.
    expect(detectProvider("https://github.com/o/r")).toBe(LinkProvider.Generic);
  });
});

describe("shortLabelFor", () => {
  it("labels each provider compactly", () => {
    expect(shortLabelFor("https://linear.app/acme/issue/ABC-123/title")).toBe("ABC-123");
    expect(shortLabelFor("https://acme.slack.com/archives/C0/p1")).toBe("msg →");
    expect(shortLabelFor("https://github.com/facebook/react/pull/42")).toBe("facebook/react#42");
    expect(shortLabelFor("https://github.com/facebook/react/issues/99")).toBe("facebook/react#99");
    expect(shortLabelFor("https://claude.ai/code/session_x")).toBe("session →");
    expect(shortLabelFor("https://www.example.com/page")).toBe("example.com");
  });
});

describe("isSafeHttpUrl", () => {
  it("allows http(s) and rejects dangerous schemes", () => {
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("canonicalizes for de-duplication", () => {
    expect(normalizeUrl("https://example.com/a/")).toBe(normalizeUrl("https://example.com/a"));
    expect(normalizeUrl("https://example.com/a#frag")).toBe(normalizeUrl("https://example.com/a"));
  });
});

describe("isPublicHttpUrl (desktop SSRF pre-filter)", () => {
  it("allows public https hosts", () => {
    expect(isPublicHttpUrl("https://example.com")).toBe(true);
    expect(isPublicHttpUrl("https://sub.example.co.uk/path?q=1")).toBe(true);
  });

  it("rejects non-https and dangerous schemes", () => {
    expect(isPublicHttpUrl("http://example.com")).toBe(false); // plaintext
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpUrl("not a url")).toBe(false);
  });

  it("rejects localhost, *.local, and bare single-label hosts", () => {
    expect(isPublicHttpUrl("https://localhost")).toBe(false);
    expect(isPublicHttpUrl("https://localhost:8787/x")).toBe(false);
    expect(isPublicHttpUrl("https://printer.local")).toBe(false);
    expect(isPublicHttpUrl("https://intranet")).toBe(false);
  });

  it("rejects private / loopback / link-local IP literals", () => {
    expect(isPublicHttpUrl("https://127.0.0.1")).toBe(false);
    expect(isPublicHttpUrl("https://10.0.0.5")).toBe(false);
    expect(isPublicHttpUrl("https://192.168.1.1")).toBe(false);
    expect(isPublicHttpUrl("https://172.16.0.1")).toBe(false);
    expect(isPublicHttpUrl("https://169.254.169.254")).toBe(false); // cloud metadata
    expect(isPublicHttpUrl("https://[::1]")).toBe(false);
    expect(isPublicHttpUrl("https://[fe80::1]")).toBe(false);
  });

  it("allows a public IP literal", () => {
    expect(isPublicHttpUrl("https://8.8.8.8")).toBe(true);
  });
});
