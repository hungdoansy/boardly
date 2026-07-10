import { expect, test } from "@playwright/test";

import { addCard, cardButton, createBoard, signUp } from "./helpers";

test.describe("accessibility / keyboard", () => {
  test("primary controls have accessible names", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    // Sidebar + header controls are named for AT / keyboard users.
    await expect(page.getByRole("button", { name: "Search /" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add column" })).toBeVisible();
  });

  test("a card is keyboard-focusable and opens / closes with Enter / Escape", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "To Do", "Keyboard card");

    const card = cardButton(page, "Keyboard card");
    await card.focus();
    await expect(card).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Keyboard card" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Keyboard card" })).toBeHidden();
  });

  test("theme toggle persists across reload and stamps the root class", async ({ page }) => {
    await signUp(page);
    // Force a known state: switch to light, reload, expect it to stick.
    const toLight = page.getByRole("button", { name: "Switch to light theme" });
    if (await toLight.isVisible().catch(() => false)) await toLight.click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/light/);
  });
});
