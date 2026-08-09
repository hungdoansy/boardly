// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { Toaster } from "@boardly/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./markdown-editor";

const { isTauriMock, openExternalMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
  openExternalMock: vi.fn(async () => true),
}));
vi.mock("../../lib/platform", () => ({ isTauri: isTauriMock }));
vi.mock("../../lib/open-external", () => ({ openExternal: openExternalMock }));

const DOC = "See [the spec](https://example.com/spec) for details.";

function preview(value = DOC) {
  render(
    <>
      <MarkdownEditor value={value} onChange={() => {}} />
      <Toaster />
    </>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "preview" }));
}

afterEach(() => {
  cleanup();
  isTauriMock.mockReturnValue(false);
  openExternalMock.mockReset();
  openExternalMock.mockResolvedValue(true);
});

describe("MarkdownEditor preview links", () => {
  it("renders a description link as a new-tab anchor (opens natively on web)", () => {
    preview();
    const anchor = screen.getByRole("link", { name: "the spec" });
    expect(anchor).toHaveAttribute("href", "https://example.com/spec");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noreferrer");
  });

  it("leaves the anchor alone on web so cmd/middle-click still work", () => {
    preview();
    const click = fireEvent.click(screen.getByRole("link", { name: "the spec" }));
    expect(click).toBe(true); // not preventDefault'd
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it("routes the click through the opener on desktop", () => {
    isTauriMock.mockReturnValue(true);
    preview();
    // Without this the Tauri webview would navigate the whole app to the page.
    const click = fireEvent.click(screen.getByRole("link", { name: "the spec" }));
    expect(click).toBe(false);
    expect(openExternalMock).toHaveBeenCalledWith("https://example.com/spec");
  });

  it("toasts when the desktop opener can't open the link", async () => {
    isTauriMock.mockReturnValue(true);
    openExternalMock.mockResolvedValue(false);
    preview();
    fireEvent.click(screen.getByRole("link", { name: "the spec" }));
    expect(await screen.findByText("Couldn't open that link")).toBeInTheDocument();
  });

  it("neutralizes a `javascript:` link (react-markdown urlTransform)", () => {
    preview("[bad](javascript:alert1)");
    // The `javascript:` URL is stripped to an empty href, so the anchor is inert.
    expect(screen.getByText("bad").closest("a")).toHaveAttribute("href", "");
  });
});
