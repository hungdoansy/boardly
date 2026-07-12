import { expect, test } from "@playwright/test";

import { addCard, createBoard, signUp } from "./helpers";

test.describe("search", () => {
  test("'/' opens search and finds a card by title, opening its detail", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Unicorn migration plan");
    await addCard(page, "Todo", "Refactor the parser");

    await page.keyboard.press("/");
    const input = page.getByPlaceholder("Search cards by title, ID, or label…");
    await expect(input).toBeVisible();

    await input.fill("unicorn");
    const result = page.getByRole("option", { name: /Unicorn migration plan/ });
    await expect(result).toBeVisible();
    await expect(page.getByRole("option", { name: /Refactor the parser/ })).toHaveCount(0);

    await result.click();
    await expect(page.getByRole("dialog", { name: "Unicorn migration plan" })).toBeVisible();
  });
});
