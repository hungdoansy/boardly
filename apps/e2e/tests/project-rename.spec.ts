import { expect, test } from "@playwright/test";

import { createBoard, signUp } from "./helpers";

// Real-browser coverage for the inline sidebar rename (UNIT-10.6). The Escape
// path can't be verified in jsdom: removing the focused input fires a native
// blur/focusout that a real browser routes to the commit handler, so only a
// real browser proves Escape cancels instead of committing the discarded text.

test("inline project rename: Escape cancels without committing", async ({ page }) => {
  await signUp(page);
  await createBoard(page);

  await page.getByRole("button", { name: "Add project" }).click();
  const row = page.getByRole("button", { name: "New project" });
  await expect(row).toBeVisible();

  await row.dblclick();
  const input = page.getByRole("textbox", { name: "Rename New project" });
  await expect(input).toBeVisible();
  await input.fill("Discarded name");
  await page.keyboard.press("Escape");

  // The original name survives; the edited text was not committed.
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discarded name" })).toHaveCount(0);
});

test("inline project rename: Enter commits", async ({ page }) => {
  await signUp(page);
  await createBoard(page);

  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByRole("button", { name: "New project" }).dblclick();
  const input = page.getByRole("textbox", { name: "Rename New project" });
  await input.fill("Platform");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Platform" })).toBeVisible();
});
