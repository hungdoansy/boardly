// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api-client", () => ({
  apiClient: { authFetch: vi.fn() },
}));

import { apiClient } from "../../lib/api-client";
import { formatBytes, StorageSettings } from "./storage-settings";

const authFetch = apiClient.authFetch as unknown as ReturnType<typeof vi.fn>;

const usage = (dbUsed: number, filesUsed: number) => ({
  ok: true,
  json: async () => ({
    database: { usedBytes: dbUsed, limitBytes: 1_073_741_824 },
    files: { usedBytes: filesUsed, limitBytes: 5_368_709_120 },
  }),
});

beforeEach(() => authFetch.mockReset());
afterEach(() => cleanup());

describe("formatBytes", () => {
  it("formats across unit boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1_048_576)).toBe("1 MB");
    expect(formatBytes(1_073_741_824)).toBe("1 GB");
    expect(formatBytes(5_368_709_120)).toBe("5 GB");
  });
});

describe("StorageSettings", () => {
  it("renders both meters with used/limit and a correct percentage", async () => {
    authFetch.mockResolvedValue(usage(536_870_912, 0)); // db 50%, files 0%
    render(<StorageSettings />);

    await waitFor(() => expect(screen.getByText(/512 MB of 1 GB/)).toBeInTheDocument());
    expect(screen.getByText(/0 B of 5 GB/)).toBeInTheDocument();

    const bars = screen.getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "50");
    expect(bars[1]).toHaveAttribute("aria-valuenow", "0");
    expect(authFetch).toHaveBeenCalledWith("/api/storage");
  });

  it("clamps to 100% and emphasizes when over the cap", async () => {
    authFetch.mockResolvedValue(usage(2_000_000_000, 0)); // db > 1 GB cap
    render(<StorageSettings />);

    await waitFor(() => {
      const bars = screen.getAllByRole("progressbar");
      expect(bars[0]).toHaveAttribute("aria-valuenow", "100");
    });
    const fill = screen.getAllByRole("progressbar")[0]!.firstChild as HTMLElement;
    expect(fill.style.backgroundColor).toBe("var(--danger)");
    expect(fill.style.width).toBe("100%");
  });

  it("shows an inline error when the fetch fails", async () => {
    authFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<StorageSettings />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load/i));
  });
});
