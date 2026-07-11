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
    expect(detectProvider("https://www.figma.com/file/abc/My-Design")).toBe(LinkProvider.Figma);
    expect(detectProvider("https://www.notion.so/My-Page-abcdef1234567890abcdef1234567890")).toBe(
      LinkProvider.Notion,
    );
    expect(detectProvider("https://trello.com/c/abc123/45-card-title")).toBe(LinkProvider.Trello);
    expect(detectProvider("https://acme.atlassian.net/browse/ABC-123")).toBe(LinkProvider.Jira);
    expect(detectProvider("https://acme.atlassian.net/wiki/spaces/X/pages/1")).toBe(
      LinkProvider.Confluence,
    );
    expect(detectProvider("https://docs.google.com/document/d/abc")).toBe(LinkProvider.GoogleDocs);
    expect(detectProvider("https://sheets.google.com/spreadsheets/d/abc")).toBe(
      LinkProvider.GoogleSheets,
    );
    expect(detectProvider("https://drive.google.com/file/d/abc")).toBe(LinkProvider.GoogleDrive);
    expect(detectProvider("https://calendar.google.com/calendar/u/0")).toBe(
      LinkProvider.GoogleCalendar,
    );
    expect(detectProvider("https://loom.com/share/abc")).toBe(LinkProvider.Loom);
    expect(detectProvider("https://miro.com/app/board/abc")).toBe(LinkProvider.Miro);
    expect(detectProvider("https://www.dropbox.com/s/abc/file.pdf")).toBe(LinkProvider.Dropbox);
    expect(detectProvider("https://www.youtube.com/watch?v=abc")).toBe(LinkProvider.YouTube);
    expect(detectProvider("https://youtu.be/abc")).toBe(LinkProvider.YouTube);
    expect(detectProvider("https://zoom.us/j/123456")).toBe(LinkProvider.Zoom);
    expect(detectProvider("https://app.asana.com/0/1/2")).toBe(LinkProvider.Asana);
    expect(detectProvider("https://airtable.com/app123/tbl456")).toBe(LinkProvider.Airtable);
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
    expect(shortLabelFor("https://www.figma.com/file/abc/My-Design-Name")).toBe(
      "My Design Name",
    );
    expect(
      shortLabelFor("https://www.notion.so/My-Page-Title-abcdef1234567890abcdef1234567890"),
    ).toBe("My Page Title");
    expect(shortLabelFor("https://trello.com/c/abc123/45-card-title")).toBe("card title");
    expect(shortLabelFor("https://acme.atlassian.net/browse/ABC-123")).toBe("ABC-123");
    expect(shortLabelFor("https://acme.atlassian.net/wiki/spaces/X/pages/1")).toBe("Confluence");
    expect(shortLabelFor("https://docs.google.com/document/d/abc")).toBe("Google Doc");
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

  it("blocks IPv4-mapped / embedded IPv6 that resolve to private v4 (allowlist bypass)", () => {
    expect(isPublicHttpUrl("https://[::ffff:127.0.0.1]")).toBe(false);
    expect(isPublicHttpUrl("https://[::ffff:169.254.169.254]")).toBe(false); // cloud metadata
    expect(isPublicHttpUrl("https://[::ffff:192.168.0.1]")).toBe(false);
    expect(isPublicHttpUrl("https://[::ffff:7f00:1]")).toBe(false); // hex-form ::ffff:127.0.0.1
    expect(isPublicHttpUrl("https://[::7f00:1]")).toBe(false); // IPv4-compatible hex
    expect(isPublicHttpUrl("https://[64:ff9b::7f00:1]")).toBe(false); // NAT64
    expect(isPublicHttpUrl("https://[2002:7f00:1::]")).toBe(false); // 6to4
    // Mapped forms are denied wholesale (URL parser hides the dotted quad).
    expect(isPublicHttpUrl("https://[::ffff:8.8.8.8]")).toBe(false);
  });

  it("allows a public IPv4 literal", () => {
    expect(isPublicHttpUrl("https://8.8.8.8")).toBe(true);
  });
});
