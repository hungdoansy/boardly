import { describe, expect, it } from "vitest";

import { scopeSvgIds } from "./scope-svg-ids";

describe("scopeSvgIds", () => {
  it("prefixes id definitions and their url()/href references", () => {
    const svg =
      '<svg><defs><linearGradient id="a"><stop/></linearGradient></defs>' +
      '<path fill="url(#a)" d="M0 0"/></svg>';
    const scoped = scopeSvgIds(svg, "icon1");
    expect(scoped).toContain('id="icon1-a"');
    expect(scoped).toContain("url(#icon1-a)");
    expect(scoped).not.toContain('id="a"');
    expect(scoped).not.toContain("url(#a)");
  });

  it("scopes xlink:href fragment references too", () => {
    const svg = '<svg><clipPath id="b"/><use xlink:href="#b"/></svg>';
    const scoped = scopeSvgIds(svg, "x");
    expect(scoped).toContain('id="x-b"');
    expect(scoped).toContain('xlink:href="#x-b"');
  });

  it("does not touch a short id that is a substring of another id", () => {
    const svg = '<svg><linearGradient id="a"/><linearGradient id="ab"/>' +
      '<path fill="url(#a)"/><path fill="url(#ab)"/></svg>';
    const scoped = scopeSvgIds(svg, "s");
    expect(scoped).toContain('id="s-a"');
    expect(scoped).toContain('id="s-ab"');
    expect(scoped).toContain("url(#s-a)");
    expect(scoped).toContain("url(#s-ab)");
  });

  it("is a no-op for svgs with no ids", () => {
    const svg = '<svg><path fill="#181717" d="M0 0"/></svg>';
    expect(scopeSvgIds(svg, "s")).toBe(svg);
  });

  it("two differently-scoped instances of the same svg never share an id", () => {
    const svg = '<svg><linearGradient id="a"/><path fill="url(#a)"/></svg>';
    const first = scopeSvgIds(svg, "icon1");
    const second = scopeSvgIds(svg, "icon2");
    expect(first).not.toBe(second);
    expect(first).toContain('id="icon1-a"');
    expect(second).toContain('id="icon2-a"');
  });
});
