import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// The canonical file, read at test time (Vite `?raw`) so drift between it and
// the MARK_SVG string constant fails this suite.
import markFile from "../assets/mark.svg?raw";
import { BoardlyMark } from "./boardly-mark";
import { MARK_SVG } from "./mark-svg";

/** Collapse whitespace so cosmetic formatting can't fail the parity check. */
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

const idsOf = (svg: Element) => Array.from(svg.querySelectorAll("linearGradient")).map((g) => g.id);

describe("BoardlyMark", () => {
  it("renders the mark with both gradients and both lobe paths", () => {
    const { container } = render(<BoardlyMark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("linearGradient")).toHaveLength(2);
    // 2 gradient-filled lobes + 2 shadow lobes.
    expect(svg!.querySelectorAll("path")).toHaveLength(4);
  });

  it("applies the size-6 default when no className is given", () => {
    const { container } = render(<BoardlyMark />);
    expect(container.firstElementChild?.className).toContain("size-6");
  });

  it("uses the passed className as the sizing (dropping the default)", () => {
    const { container } = render(<BoardlyMark className="size-4 text-fg" />);
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toContain("size-4");
    expect(cls).toContain("text-fg");
    expect(cls).not.toContain("size-6");
  });

  it("scopes gradient ids per instance so two marks never collide", () => {
    const { container } = render(
      <>
        <BoardlyMark />
        <BoardlyMark />
      </>,
    );
    const svgs = Array.from(container.querySelectorAll("svg"));
    expect(svgs).toHaveLength(2);
    const [first, second] = svgs;
    if (!first || !second) throw new Error("expected two marks");

    // Every gradient id is unique across the two instances...
    expect(new Set([...idsOf(first), ...idsOf(second)]).size).toBe(4);

    // ...and each instance's paths reference its OWN scoped gradient, not the
    // other's (the collision bug scope-svg-ids exists to prevent).
    for (const svg of [first, second]) {
      const ids = idsOf(svg);
      const fills = Array.from(svg.querySelectorAll("path[fill^='url']")).map((p) =>
        p.getAttribute("fill"),
      );
      for (const fill of fills) {
        const ref = fill?.match(/url\(#(.+?)\)/)?.[1];
        if (ref) expect(ids).toContain(ref);
      }
    }
  });

  it("stays in sync with the canonical assets/mark.svg file", () => {
    expect(normalize(markFile)).toBe(normalize(MARK_SVG));
  });
});
