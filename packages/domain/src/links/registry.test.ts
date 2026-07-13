import { describe, expect, it } from "vitest";

import { LinkProvider } from "../enums";
import {
  detectProvider,
  isPublicHttpUrl,
  isSafeHttpUrl,
  linkLabel,
  linkSubtitle,
  normalizeUrl,
  shortLabelFor,
  stripDeepLinkMarker,
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
    expect(detectProvider("https://www.facebook.com/acme/posts/1")).toBe(LinkProvider.Facebook);
    expect(detectProvider("https://x.com/acme/status/1")).toBe(LinkProvider.Twitter);
    expect(detectProvider("https://twitter.com/acme/status/1")).toBe(LinkProvider.Twitter);
    expect(detectProvider("https://www.instagram.com/p/abc")).toBe(LinkProvider.Instagram);
    expect(detectProvider("https://www.linkedin.com/in/acme")).toBe(LinkProvider.LinkedIn);
    expect(
      detectProvider("https://www.reddit.com/r/programming/comments/1/title"),
    ).toBe(LinkProvider.Reddit);
    expect(detectProvider("https://discord.com/channels/1/2")).toBe(LinkProvider.Discord);
    expect(detectProvider("https://www.tiktok.com/@acme/video/1")).toBe(LinkProvider.TikTok);
    expect(detectProvider("https://www.pinterest.com/pin/1")).toBe(LinkProvider.Pinterest);
    expect(detectProvider("https://wa.me/1234567890")).toBe(LinkProvider.WhatsApp);
    expect(detectProvider("https://t.me/acme")).toBe(LinkProvider.Telegram);
    expect(detectProvider("https://medium.com/@acme/my-post-title-abc123def456")).toBe(
      LinkProvider.Medium,
    );
    expect(
      detectProvider("https://stackoverflow.com/questions/123/how-do-i-x"),
    ).toBe(LinkProvider.StackOverflow);
    expect(
      detectProvider("https://gitlab.com/group/project/-/merge_requests/45"),
    ).toBe(LinkProvider.GitLab);
    expect(
      detectProvider("https://gitlab.com/group/project/-/issues/123"),
    ).toBe(LinkProvider.GitLab);
    expect(detectProvider("https://gitlab.com/group/project")).toBe(LinkProvider.GitLab);
    expect(detectProvider("https://bitbucket.org/acme/repo")).toBe(LinkProvider.Bitbucket);
    expect(detectProvider("https://www.npmjs.com/package/react")).toBe(LinkProvider.Npm);
    expect(detectProvider("https://hub.docker.com/r/library/node")).toBe(LinkProvider.DockerHub);
    expect(detectProvider("https://open.spotify.com/track/1")).toBe(LinkProvider.Spotify);
    expect(detectProvider("https://www.twitch.tv/acme")).toBe(LinkProvider.Twitch);
    expect(detectProvider("https://vimeo.com/1")).toBe(LinkProvider.Vimeo);
    expect(detectProvider("https://www.behance.net/gallery/1")).toBe(LinkProvider.Behance);
    expect(detectProvider("https://dribbble.com/shots/1")).toBe(LinkProvider.Dribbble);
    expect(detectProvider("https://codepen.io/acme/pen/1")).toBe(LinkProvider.CodePen);
    expect(detectProvider("https://replit.com/@acme/project")).toBe(LinkProvider.Replit);
    expect(detectProvider("https://meet.google.com/abc-defg-hij")).toBe(LinkProvider.GoogleMeet);
    expect(detectProvider("https://stripe.com/docs")).toBe(LinkProvider.Stripe);
    expect(detectProvider("https://en.wikipedia.org/wiki/Kanban_board")).toBe(
      LinkProvider.Wikipedia,
    );
    expect(detectProvider("https://example.com/page")).toBe(LinkProvider.Generic);
  });

  it("falls back to generic on malformed/relative urls", () => {
    expect(detectProvider("not a url")).toBe(LinkProvider.Generic);
    expect(detectProvider("/relative")).toBe(LinkProvider.Generic);
  });

  it("detects a bare github repo url", () => {
    expect(detectProvider("https://github.com/o/r")).toBe(LinkProvider.GitHub);
    expect(detectProvider("https://github.com/o/r/")).toBe(LinkProvider.GitHub);
  });

  it("does not misread github's own top-level pages as a repo", () => {
    expect(detectProvider("https://github.com/settings/profile")).toBe(LinkProvider.Generic);
    expect(detectProvider("https://github.com/orgs/acme")).toBe(LinkProvider.Generic);
  });
});

describe("shortLabelFor", () => {
  it("labels each provider compactly", () => {
    expect(shortLabelFor("https://linear.app/acme/issue/ABC-123/title")).toBe("ABC-123");
    expect(shortLabelFor("https://acme.slack.com/archives/C0/p1")).toBe("Acme");
    expect(shortLabelFor("https://app.slack.com/client/T1/C1")).toBe("Slack");
    expect(shortLabelFor("https://slack.com/archives/C0/p1")).toBe("Slack");
    expect(shortLabelFor("https://github.com/facebook/react/pull/42")).toBe("facebook/react#42");
    expect(shortLabelFor("https://github.com/facebook/react/issues/99")).toBe("facebook/react#99");
    expect(shortLabelFor("https://github.com/facebook/react")).toBe("facebook/react");
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
    expect(shortLabelFor("https://x.com/acme/status/1")).toBe("@acme");
    expect(shortLabelFor("https://x.com/i/lists/1")).toBe("X");
    expect(
      shortLabelFor("https://www.reddit.com/r/programming/comments/1/hello-world"),
    ).toBe("hello world");
    expect(shortLabelFor("https://www.reddit.com/r/programming")).toBe("r/programming");
    expect(shortLabelFor("https://medium.com/@acme/my-post-title-abc123def456")).toBe(
      "my post title",
    );
    expect(shortLabelFor("https://medium.com/@acme")).toBe("Medium");
    expect(shortLabelFor("https://stackoverflow.com/questions/123/how-do-i-x")).toBe(
      "how do i x",
    );
    expect(shortLabelFor("https://gitlab.com/group/project/-/merge_requests/45")).toBe(
      "group/project!45",
    );
    expect(shortLabelFor("https://gitlab.com/group/project/-/issues/123")).toBe(
      "group/project#123",
    );
    expect(shortLabelFor("https://gitlab.com/group/project")).toBe("GitLab");
    expect(shortLabelFor("https://www.npmjs.com/package/react")).toBe("react");
    expect(shortLabelFor("https://www.npmjs.com/package/@boardly/domain")).toBe(
      "@boardly/domain",
    );
    expect(shortLabelFor("https://en.wikipedia.org/wiki/Kanban_board")).toBe("Kanban board");
    expect(shortLabelFor("https://www.example.com/page")).toBe("example.com");
  });
});

describe("stripDeepLinkMarker", () => {
  it("strips the trailing arrow marker and flags the label as a deep link", () => {
    expect(stripDeepLinkMarker("msg →")).toEqual({ label: "msg", isDeepLink: true });
    expect(stripDeepLinkMarker("session →")).toEqual({ label: "session", isDeepLink: true });
  });

  it("leaves a non-deep-link label untouched", () => {
    expect(stripDeepLinkMarker("Slack")).toEqual({ label: "Slack", isDeepLink: false });
    expect(stripDeepLinkMarker("example.com")).toEqual({
      label: "example.com",
      isDeepLink: false,
    });
  });

  it("no longer flags Slack as a deep link (no arrow, UNIT-9.8)", () => {
    expect(stripDeepLinkMarker(shortLabelFor("https://acme.slack.com/archives/C0/p1"))).toEqual({
      label: "Acme",
      isDeepLink: false,
    });
    // Other providers keep the deep-link marker (and its arrow affordance).
    expect(stripDeepLinkMarker(shortLabelFor("https://claude.ai/code/session_x")).isDeepLink).toBe(
      true,
    );
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

describe("linkLabel / linkSubtitle", () => {
  it("prefers a fetched title for non-GitHub links", () => {
    const link = { provider: LinkProvider.Generic, url: "https://example.com/page", title: "Example Page" };
    expect(linkLabel(link)).toBe("Example Page");
    expect(linkSubtitle(link)).toBeUndefined();
  });

  it("always shows the repo path for GitHub, and moves a fetched title to the subtitle", () => {
    const link = {
      provider: LinkProvider.GitHub,
      url: "https://github.com/facebook/react",
      title: "The library for web and native user interfaces.",
    };
    expect(linkLabel(link)).toBe("facebook/react");
    expect(linkSubtitle(link)).toBe("The library for web and native user interfaces.");
  });

  it("has no subtitle when a GitHub link has no fetched title", () => {
    const link = { provider: LinkProvider.GitHub, url: "https://github.com/o/r/pull/1" };
    expect(linkLabel(link)).toBe("o/r#1");
    expect(linkSubtitle(link)).toBeUndefined();
  });
});
