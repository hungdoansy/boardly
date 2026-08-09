import { expect, test, type Page } from "@playwright/test";

import { addCard, cardFace, createBoard, signUp } from "./helpers";

const mainFilter = (page: Page): Promise<string> =>
  page.getByRole("main").evaluate((el) => getComputedStyle(el).filter);
const htmlFocus = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute("data-focus"));

async function seed(page: Page): Promise<void> {
  await signUp(page);
  await createBoard(page);
  await addCard(page, "Todo", "Apple");
  await addCard(page, "Todo", "Banana");
}

test("focus mode: Shift+F cycles + mutes the board; drawer escapes; per-theme saturate", async ({
  page,
}) => {
  await seed(page);

  // Off — no attribute, no filter on the content region.
  expect(await htmlFocus(page)).toBeNull();
  expect(await mainFilter(page)).toBe("none");

  // Shift+F → Calm: dark mutes at saturate(0.4); the toolbar reflects the level.
  // (Poll — the filter transitions from none, so read it after it settles.)
  await page.keyboard.press("Shift+F");
  await expect.poll(() => htmlFocus(page)).toBe("calm");
  await expect.poll(() => mainFilter(page)).toContain("saturate(0.4)");
  await expect(page.getByRole("button", { name: /Focus mode: calm/ })).toBeVisible();
  // Committed dark Calm baseline (main region only — the sidebar carries a per-run avatar).
  await expect(page.getByRole("main")).toHaveScreenshot("focus-calm-dark.png");

  // The detail drawer portals out of the scoped region → stays full-color.
  await cardFace(page, "Apple").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Not muted — it portals out of the scoped region (no `saturate` applied).
  expect(await dialog.evaluate((el) => getComputedStyle(el).filter)).not.toContain("saturate");
  await page.keyboard.press("Escape");

  // Light theme mutes a touch less (per-theme token): saturate(0.5).
  await page.getByRole("button", { name: /Switch to light theme/ }).click();
  await expect.poll(() => mainFilter(page)).toContain("saturate(0.5)");
  await expect(page.getByRole("main")).toHaveScreenshot("focus-calm-light.png");

  // Cycle onward: Calm → Zen (still muted) → Off (filter clears).
  await page.keyboard.press("Shift+F");
  await expect.poll(() => htmlFocus(page)).toBe("zen");
  await expect.poll(() => mainFilter(page)).toContain("saturate");
  await page.keyboard.press("Shift+F");
  await expect.poll(() => htmlFocus(page)).toBeNull();
  await expect.poll(() => mainFilter(page)).toBe("none");
});

test("focus mode: Zen collapses the card face + list row (both surfaces, both themes)", async ({
  page,
}) => {
  await seed(page);

  // Give a card a visible, queryable badge (a past due date → "Overdue" chip).
  await cardFace(page, "Apple").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Due date" }).click();
  await page.getByLabel("Due date input").fill("2020-06-15");
  await page.keyboard.press("Escape"); // close the date popover
  await page.getByRole("button", { name: "Close" }).click(); // close the drawer
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const todo = page.getByRole("region", { name: "Column: Todo" });
  await expect(todo.getByText("Overdue")).toBeVisible();

  // Zen (off → calm → zen): the board card face collapses to title + status.
  await page.keyboard.press("Shift+F");
  await page.keyboard.press("Shift+F");
  await expect.poll(() => htmlFocus(page)).toBe("zen");
  await expect(todo.getByText("Overdue")).toHaveCount(0);
  await expect(page.getByText("Apple")).toBeVisible();
  await expect(page.getByRole("main")).toHaveScreenshot("focus-zen-board-dark.png");

  // Same in the list lens — trailing badges gone, title + shortId remain.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('[data-nav="row"]').first()).toBeVisible();
  await expect(page.getByText("Overdue")).toHaveCount(0);
  await expect(page.getByText("Apple")).toBeVisible();
  await expect(page.getByRole("main")).toHaveScreenshot("focus-zen-list-dark.png");

  // Light theme baselines for both surfaces.
  await page.getByRole("button", { name: /Switch to light theme/ }).click();
  await expect(page.getByRole("main")).toHaveScreenshot("focus-zen-list-light.png");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByText("Apple")).toBeVisible();
  await expect(page.getByRole("main")).toHaveScreenshot("focus-zen-board-light.png");
});
