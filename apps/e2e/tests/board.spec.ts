import { expect, test } from "@playwright/test";

import { addCard, createBoard, signUp, STATUS_COLUMNS } from "./helpers";

test.describe("board", () => {
  test("renders the fixed status columns (no add-column) and places cards by status", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);

    // Exactly the eight fixed status columns, and no add-column affordance.
    for (const name of STATUS_COLUMNS) {
      await expect(page.getByRole("region", { name: `Column: ${name}` })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Add column" })).toHaveCount(0);

    // A card's column IS its status: add cards into the Todo and In Progress columns.
    await addCard(page, "Todo", "Write the spec");
    await addCard(page, "Todo", "Review the PR");
    await addCard(page, "In Progress", "Ship the feature");

    const todo = page.getByRole("region", { name: "Column: Todo" });
    await expect(todo.getByRole("button", { name: "Card: Write the spec" })).toBeVisible();
    await expect(todo.getByRole("button", { name: "Card: Review the PR" })).toBeVisible();
    const inProgress = page.getByRole("region", { name: "Column: In Progress" });
    await expect(inProgress.getByRole("button", { name: "Card: Ship the feature" })).toBeVisible();
  });

  test("hide-empty-columns toggle hides zero-card columns", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "The only card");

    await page.getByRole("button", { name: "Hide empty columns" }).click();

    // Only the populated column remains; the empty ones are hidden.
    await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Column: Backlog" })).toHaveCount(0);

    // Turning it back on restores all eight.
    await page.getByRole("button", { name: "Show empty columns" }).click();
    await expect(page.getByRole("region", { name: "Column: Backlog" })).toBeVisible();
  });

  test("dark-theme board matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Design the dashboard");

    await expect(page.getByRole("button", { name: "Card: Design the dashboard" })).toBeVisible();
    await expect(page).toHaveScreenshot("board-dark.png", { maxDiffPixelRatio: 0.03 });
  });
});
