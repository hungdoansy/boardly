import { describe, expect, it } from "vitest";

import { LinkProvider } from "./enums";
import { detectProvider, shortLabelFor } from "./links";

describe("detectProvider", () => {
  it("maps known hosts to their providers", () => {
    expect(detectProvider("https://acme.slack.com/archives/C0/p1700000000")).toBe(
      LinkProvider.Slack,
    );
    expect(detectProvider("https://linear.app/acme/issue/ABC-123/the-title")).toBe(
      LinkProvider.Linear,
    );
    expect(detectProvider("https://claude.ai/code/session_abc")).toBe(LinkProvider.Claude);
    expect(detectProvider("https://example.com/whatever")).toBe(LinkProvider.Generic);
  });

  it("falls back to generic on malformed/relative urls without throwing", () => {
    expect(detectProvider("not a url")).toBe(LinkProvider.Generic);
    expect(detectProvider("/relative/path")).toBe(LinkProvider.Generic);
    expect(detectProvider("")).toBe(LinkProvider.Generic);
  });
});

describe("shortLabelFor", () => {
  it("extracts the Linear issue id from the path", () => {
    expect(shortLabelFor("https://linear.app/acme/issue/ABC-123/some-title")).toBe("ABC-123");
  });

  it("labels slack messages and claude sessions compactly", () => {
    expect(shortLabelFor("https://acme.slack.com/archives/C0/p1")).toBe("msg →");
    expect(shortLabelFor("https://claude.ai/code/session_x")).toBe("session →");
  });

  it("uses the hostname (stripping www) for generic urls", () => {
    expect(shortLabelFor("https://www.example.com/path")).toBe("example.com");
  });

  it("returns the raw string for an unparseable generic url", () => {
    expect(shortLabelFor("not a url")).toBe("not a url");
  });
});
