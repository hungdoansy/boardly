// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Toaster, toast } from "./toast";

afterEach(cleanup);

describe("Toaster", () => {
  it("shows a queued message", async () => {
    render(<Toaster />);
    act(() => toast("Resume command copied"));
    expect(await screen.findByText("Resume command copied")).toBeVisible();
  });

  it("shows multiple messages without crashing", async () => {
    render(<Toaster />);
    act(() => {
      toast("First");
      toast("Second");
    });
    expect(await screen.findByText("First")).toBeVisible();
    expect(await screen.findByText("Second")).toBeVisible();
  });
});
