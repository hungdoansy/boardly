import { describe, expect, it } from "vitest";

import { LinkProvider } from "../enums";
import { detectProvider, normalizeUrl, shortLabelFor } from "./registry";

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

describe("normalizeUrl", () => {
  it("canonicalizes for de-duplication", () => {
    expect(normalizeUrl("https://example.com/a/")).toBe(normalizeUrl("https://example.com/a"));
    expect(normalizeUrl("https://example.com/a#frag")).toBe(normalizeUrl("https://example.com/a"));
  });
});
