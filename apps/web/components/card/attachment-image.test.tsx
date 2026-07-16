// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api-client", () => ({
  apiClient: { authFetch: vi.fn() },
}));

import { apiClient } from "../../lib/api-client";
import { AttachmentImage } from "./attachment-image";

const authFetch = apiClient.authFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authFetch.mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AttachmentImage", () => {
  it("renders an external URL as a plain img without fetching", () => {
    render(<AttachmentImage src="https://example.com/pic.png" alt="external" />);
    const img = screen.getByRole("img", { name: "external" });
    expect(img).toHaveAttribute("src", "https://example.com/pic.png");
    expect(authFetch).not.toHaveBeenCalled();
  });

  it("fetches an owned attachment and renders it from an object URL", async () => {
    authFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["bytes"]) });
    render(<AttachmentImage src="/attachments/xyz" alt="shot" />);

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "shot" });
      expect(img).toHaveAttribute("src", "blob:mock-url");
    });
    expect(authFetch).toHaveBeenCalledWith("/attachments/xyz");
  });

  it("shows a broken-image state when the serve route fails", async () => {
    authFetch.mockResolvedValue({ ok: false, status: 404 });
    render(<AttachmentImage src="/attachments/gone" alt="missing shot" />);

    await waitFor(() => {
      const broken = screen.getByRole("img", { name: /failed to load/i });
      expect(broken).toHaveTextContent(/unavailable/i);
    });
  });
});
