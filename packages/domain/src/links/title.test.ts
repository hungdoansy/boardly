import { describe, expect, it } from "vitest";

import { decodeHtmlEntities, usableTitle } from "./title";

describe("decodeHtmlEntities", () => {
  it("decodes the named references that appear in titles", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("&lt;script&gt;")).toBe("<script>");
    expect(decodeHtmlEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeHtmlEntities("it&apos;s")).toBe("it's");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("decodes decimal and hex numeric references", () => {
    expect(decodeHtmlEntities("caf&#233;")).toBe("café");
    expect(decodeHtmlEntities("it&#39;s")).toBe("it's");
    expect(decodeHtmlEntities("it&#x27;s")).toBe("it's");
    expect(decodeHtmlEntities("&#x1F600;")).toBe("\u{1F600}");
  });

  it("decodes a real Vietnamese title that the old six-entity table mangled", () => {
    // Regression: this rendered literally as `CH&#x1ee2; GAMING GEAR` on a card.
    expect(decodeHtmlEntities("CH&#x1ee2; GAMING GEAR: PH&#xcd;M C&#x1a0;, CHU&#x1ed8;T")).toBe(
      "CHỢ GAMING GEAR: PHÍM CƠ, CHUỘT",
    );
    expect(decodeHtmlEntities("Nguy&#x1ec5;n &#x110;&#x1ee9;c M&#x1ea1;nh")).toBe(
      "Nguyễn Đức Mạnh",
    );
  });

  it("decodes in a single pass, so an escaped reference stays escaped", () => {
    expect(decodeHtmlEntities("&amp;#39;")).toBe("&#39;");
  });

  it("leaves unknown, malformed, and out-of-range references alone", () => {
    expect(decodeHtmlEntities("&bogus;")).toBe("&bogus;");
    expect(decodeHtmlEntities("&#;")).toBe("&#;");
    expect(decodeHtmlEntities("&#x110000;")).toBe("&#x110000;");
    expect(decodeHtmlEntities("&#0;")).toBe("&#0;");
    expect(decodeHtmlEntities("&#xD800;")).toBe("&#xD800;"); // lone surrogate
    expect(decodeHtmlEntities("100% & rising")).toBe("100% & rising");
  });
});

describe("usableTitle", () => {
  it("returns a cleaned, decoded title", () => {
    expect(usableTitle("  Never   Gonna\nGive You Up  ")).toBe("Never Gonna Give You Up");
    expect(usableTitle("caf&#233; news")).toBe("café news");
  });

  it("keeps a normal title even when it contains an error-ish word", () => {
    expect(usableTitle("Error Handling in React")).toBe("Error Handling in React");
    expect(usableTitle("Top 100 Node.js Interview Questions and Answers")).toBe(
      "Top 100 Node.js Interview Questions and Answers",
    );
    // A leading number that is not a status/reason pair must survive.
    expect(usableTitle("500 Startups | Home")).toBe("500 Startups | Home");
    expect(usableTitle("nuqs | Type-safe search params state management")).toBe(
      "nuqs | Type-safe search params state management",
    );
  });

  it("rejects nothing-titles", () => {
    expect(usableTitle(undefined)).toBeUndefined();
    expect(usableTitle("")).toBeUndefined();
    expect(usableTitle("   ")).toBeUndefined();
    expect(usableTitle("|")).toBeUndefined();
    expect(usableTitle("Untitled")).toBeUndefined();
  });

  it("rejects bot walls and interstitials", () => {
    expect(usableTitle("Just a moment...")).toBeUndefined();
    expect(usableTitle("Attention Required! | Cloudflare")).toBeUndefined();
    expect(usableTitle("Checking your browser")).toBeUndefined();
    expect(usableTitle("Verify you are human")).toBeUndefined();
    // The interstitial sits in the first segment, the brand in the second.
    expect(usableTitle("Security Check | Wellfound")).toBeUndefined();
  });

  it("rejects error pages", () => {
    expect(usableTitle("Not Found")).toBeUndefined();
    expect(usableTitle("404: Page not found")).toBeUndefined();
    expect(usableTitle("404 Not Found")).toBeUndefined();
    expect(usableTitle("403 Forbidden")).toBeUndefined();
    expect(usableTitle("500 Internal Server Error")).toBeUndefined();
    expect(usableTitle("Access Denied")).toBeUndefined();
  });

  it("rejects a title that only repeats the chip's own short label", () => {
    // A real LinkedIn job page that answers with the bare brand string.
    expect(usableTitle("LinkedIn", "LinkedIn")).toBeUndefined();
    expect(usableTitle("  youtube  ", "YouTube")).toBeUndefined();
    expect(usableTitle("Senior Frontend Engineer | LinkedIn Jobs", "LinkedIn")).toBe(
      "Senior Frontend Engineer | LinkedIn Jobs",
    );
  });

  it("strips separator debris from a half-empty title template", () => {
    expect(usableTitle("| Vishwas Gopinath")).toBe("Vishwas Gopinath");
    expect(usableTitle("Some Page -")).toBe("Some Page");
  });
});
