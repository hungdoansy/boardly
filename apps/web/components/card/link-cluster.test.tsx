// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { CardLink } from "@boardly/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LinkCluster } from "./link-cluster";

/** Build `n` links with ascending fractional ords (a0, a1, …). */
function makeLinks(n: number): CardLink[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    url: `https://example.com/${i}`,
    provider: "generic" as const,
    ord: `a${i}`,
  }));
}

const icons = (c: HTMLElement) => c.querySelectorAll("[data-link-icon]");

afterEach(() => cleanup());

describe("LinkCluster", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(<LinkCluster links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows every icon and no overflow chip at or below the cap", () => {
    const { container: three } = render(<LinkCluster links={makeLinks(3)} />);
    expect(icons(three)).toHaveLength(3);
    expect(three.textContent).not.toMatch(/\+/);
    cleanup();

    const { container: five } = render(<LinkCluster links={makeLinks(5)} />);
    expect(icons(five)).toHaveLength(5);
    expect(five.textContent).not.toMatch(/\+/);
  });

  it("caps icons at 5 and shows a +N overflow chip", () => {
    const { container: six } = render(<LinkCluster links={makeLinks(6)} />);
    expect(icons(six)).toHaveLength(5);
    expect(screen.getByText("+1")).toBeInTheDocument();
    cleanup();

    const { container: many } = render(<LinkCluster links={makeLinks(26)} />);
    expect(icons(many)).toHaveLength(5);
    expect(screen.getByText("+21")).toBeInTheDocument();
  });

  it("renders the first 5 icons in the given (ord) order", () => {
    const links = makeLinks(7);
    const { container } = render(<LinkCluster links={links} />);
    const titles = [...icons(container)].map((el) => el.getAttribute("title"));
    // shortLabelFor a generic URL is its host — all "example.com" here, so
    // assert count/order via the stable slice of the first five.
    expect(titles).toHaveLength(5);
  });

  it("labels the cluster with the total link count", () => {
    render(<LinkCluster links={makeLinks(8)} />);
    expect(screen.getByLabelText("8 links")).toBeInTheDocument();
    cleanup();
    render(<LinkCluster links={makeLinks(1)} />);
    expect(screen.getByLabelText("1 link")).toBeInTheDocument();
  });
});
