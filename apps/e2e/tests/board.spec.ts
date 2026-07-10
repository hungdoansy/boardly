import { expect, test } from "@playwright/test";

import { addCard, addColumn, createBoard, signUp } from "./helpers";

test.describe("board", () => {
  test("a new board is seeded with default columns; add a column and cards", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // Seeded columns.
    for (const name of ["To Do", "Doing", "Done"]) {
      await expect(page.getByRole("region", { name: `Column: ${name}` })).toBeVisible();
    }

    // Add a new column, and cards into existing columns.
    await addColumn(page, "QA");
    await addCard(page, "To Do", "Write the spec");
    await addCard(page, "To Do", "Review the PR");
    await addCard(page, "Doing", "Ship the feature");

    const todo = page.getByRole("region", { name: "Column: To Do" });
    await expect(todo.getByRole("button", { name: "Card: Write the spec" })).toBeVisible();
    await expect(todo.getByRole("button", { name: "Card: Review the PR" })).toBeVisible();
    const doing = page.getByRole("region", { name: "Column: Doing" });
    await expect(doing.getByRole("button", { name: "Card: Ship the feature" })).toBeVisible();
  });

  test("dark-theme board matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "To Do", "Design the dashboard");

    await expect(page.getByRole("button", { name: "Card: Design the dashboard" })).toBeVisible();
    await expect(page).toHaveScreenshot("board-dark.png", { maxDiffPixelRatio: 0.03 });
  });
});
