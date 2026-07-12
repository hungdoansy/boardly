import { expect, test, type Page } from "@playwright/test";

import { addCard, createBoard, signUp } from "./helpers";

const rowLabels = (page: Page): Promise<(string | null)[]> =>
  page
    .locator('[data-nav="row"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));

/** Pick an option from a toolbar menu (scoped to that menu's popover dialog). */
async function pick(page: Page, trigger: string, menu: string, option: string): Promise<void> {
  await page.getByRole("button", { name: trigger }).click();
  await page.getByRole("dialog", { name: menu }).getByRole("button", { name: option }).click();
}

/** Sign up, create a board, add three cards, and switch to the list lens. */
async function seedList(page: Page): Promise<void> {
  await signUp(page);
  await createBoard(page);
  await addCard(page, "Todo", "Banana");
  await addCard(page, "Todo", "Apple");
  await addCard(page, "Todo", "Cherry");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('[data-nav="row"]')).toHaveCount(3);
}

test("list: filter/sort/group + Board↔List + saved-view round-trip", async ({ page }) => {
  await seedList(page);

  // Sort by title (ascending by default).
  await pick(page, "Sort", "Sort menu", "Title");
  await expect.poll(() => rowLabels(page)).toEqual(["Apple", "Banana", "Cherry"]);

  // Group by status → one "Todo" section holding all three cards.
  await pick(page, "Group by", "Group by menu", "Status");
  await expect(page.getByRole("region", { name: "Group: Todo" })).toBeVisible();

  // Switch to Board and back to List — the group + sort survive the layout flip.
  // (A grouped board renders swimlanes, not columns.)
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lane: Todo" })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("region", { name: "Group: Todo" })).toBeVisible();
  await expect.poll(() => rowLabels(page)).toEqual(["Apple", "Banana", "Cherry"]);

  // Save the current lens as a named view.
  await page.getByRole("button", { name: "Views and filters" }).click();
  const viewsMenu = page.getByRole("dialog", { name: "Views menu" });
  await viewsMenu.getByRole("textbox", { name: "View name" }).fill("Sorted list");
  await viewsMenu.getByRole("button", { name: "Save" }).click();
  await page.keyboard.press("Escape");

  // Change the lens: clear grouping and drop back to the board.
  await pick(page, "Group by", "Group by menu", "None");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Group: Todo" })).toHaveCount(0);

  // Re-apply the saved view → layout (list), grouping (status), and sort all restored.
  await page.getByRole("button", { name: "Views and filters" }).click();
  await page
    .getByRole("dialog", { name: "Views menu" })
    .getByRole("button", { name: "Sorted list" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Group: Todo" })).toBeVisible();
  await expect.poll(() => rowLabels(page)).toEqual(["Apple", "Banana", "Cherry"]);
});

test("list: grouped dark visual baseline", async ({ page }) => {
  await seedList(page);
  await pick(page, "Sort", "Sort menu", "Title");
  await pick(page, "Group by", "Group by menu", "Status");
  await expect(page.getByRole("region", { name: "Group: Todo" })).toBeVisible();
  // Screenshot the list region only (the sidebar carries a per-run account avatar).
  await expect(page.getByRole("main")).toHaveScreenshot("list-grouped-dark.png");
});
