import { expect, test } from "@playwright/test";

import { addCard, cardButton, createBoard, signUp } from "./helpers";

test.describe("accessibility / keyboard", () => {
  test("primary controls have accessible names", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    // Sidebar + header controls are named for AT / keyboard users.
    await expect(page.getByRole("button", { name: "Search /" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
    // Sign out lives behind the sidebar account popover — the trigger is named,
    // and so is the item it reveals.
    const account = page.getByRole("button", { name: "Account" });
    await expect(account).toBeVisible();
    await account.click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("a card is keyboard-focusable and opens / closes with Enter / Escape", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Keyboard card");

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
    await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/light/);
  });
});
