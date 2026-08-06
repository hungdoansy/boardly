import { expect, type Page, test } from "@playwright/test";

import { addCard, createBoard, signUp, STATUS_COLUMNS } from "./helpers";

const openColumnsMenu = (page: Page): Promise<void> =>
  page.getByRole("button", { name: /^Columns/ }).click();

// The menu is modal — it `aria-hidden`s the board, so column assertions have to
// wait until it closes.
const closeMenu = (page: Page): Promise<void> => page.keyboard.press("Escape");

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

  test("show-empty-columns toggle hides zero-card columns", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "The only card");

    await openColumnsMenu(page);
    await page.getByRole("menuitemcheckbox", { name: /Show empty columns/ }).click();
    await closeMenu(page);

    // Only the populated column remains; the empty ones are hidden.
    await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Column: Backlog" })).toHaveCount(0);

    // Turning it back on restores all eight.
    await openColumnsMenu(page);
    await page.getByRole("menuitemcheckbox", { name: /Show empty columns/ }).click();
    await closeMenu(page);
    await expect(page.getByRole("region", { name: "Column: Backlog" })).toBeVisible();
  });

  test("marks a column's visible cards done from its 3-dots menu (UNIT-19)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "First chore");
    await addCard(page, "Todo", "Second chore");
    await addCard(page, "Backlog", "Untouched");

    await page.getByRole("button", { name: "Todo column actions" }).click();
    await page.getByRole("menuitem", { name: "Mark all done" }).click();

    // The confirmation names the visible count and the column.
    await expect(
      page.getByRole("heading", { name: "Mark all 2 cards in Todo as done?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark all done" }).click();

    // A card's column IS its status, so both cards land in Done; other columns stay put.
    const done = page.getByRole("region", { name: "Column: Done" });
    await expect(done.getByRole("button", { name: "Card: First chore" })).toBeVisible();
    await expect(done.getByRole("button", { name: "Card: Second chore" })).toBeVisible();
    const todo = page.getByRole("region", { name: "Column: Todo" });
    await expect(todo.getByRole("button", { name: /^Card: / })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Column: Backlog" }).getByRole("button", {
        name: "Card: Untouched",
      }),
    ).toBeVisible();

    // Done is now the one column where the action would be a no-op, so it is gone.
    await page.getByRole("button", { name: "Done column actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Archive all" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Mark all done" })).toHaveCount(0);
  });

  test("hides a column from its 3-dots menu and keeps it hidden across a reload", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Still here");

    await page.getByRole("button", { name: "Duplicate column actions" }).click();
    await page.getByRole("menuitem", { name: "Hide" }).click();

    await expect(page.getByRole("region", { name: "Column: Duplicate" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Columns, 1 hidden" })).toBeVisible();

    // The preference is device-local (localStorage), so a reload is the only
    // real proof it persists — jsdom tests cannot show this.
    await page.reload();
    await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Column: Duplicate" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Columns, 1 hidden" })).toBeVisible();
  });

  test("restores hidden columns from the Columns menu", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // Hide two, one from each surface.
    await page.getByRole("button", { name: "Canceled column actions" }).click();
    await page.getByRole("menuitem", { name: "Hide" }).click();
    await openColumnsMenu(page);
    await page.getByRole("menuitemcheckbox", { name: /^Backlog/ }).click();

    // Re-checking one row brings that column back at its STATUS_ORDER position.
    await page.getByRole("menuitemcheckbox", { name: /^Backlog/ }).click();
    await closeMenu(page);
    await expect(page.getByRole("region", { name: "Column: Backlog" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Column: Canceled" })).toHaveCount(0);

    // "Show all columns" clears the rest.
    await openColumnsMenu(page);
    await page.getByRole("menuitem", { name: "Show all columns" }).click();
    for (const name of STATUS_COLUMNS) {
      await expect(page.getByRole("region", { name: `Column: ${name}` })).toBeVisible();
    }
  });

  test("a card in a hidden column is not archived — it still shows in list view", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Hidden but alive");

    await page.getByRole("button", { name: "Todo column actions" }).click();
    await page.getByRole("menuitem", { name: "Hide" }).click();
    await expect(page.getByRole("region", { name: "Column: Todo" })).toHaveCount(0);

    // The menu still reports the card, so it is discoverable rather than lost.
    await openColumnsMenu(page);
    await expect(page.getByRole("menuitemcheckbox", { name: /^Todo/ })).toContainText("1");
    await closeMenu(page);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByText("Hidden but alive")).toBeVisible();
  });

  test("dark-theme Columns menu matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Design the dashboard");

    await page.getByRole("button", { name: "Canceled column actions" }).click();
    await page.getByRole("menuitem", { name: "Hide" }).click();
    await openColumnsMenu(page);
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page).toHaveScreenshot("columns-menu-dark.png", { maxDiffPixelRatio: 0.03 });
  });

  test("dark-theme board matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Design the dashboard");

    await expect(page.getByRole("button", { name: "Card: Design the dashboard" })).toBeVisible();
    await expect(page).toHaveScreenshot("board-dark.png", { maxDiffPixelRatio: 0.03 });
  });
});
