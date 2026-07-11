import { expect, test, type Page } from "@playwright/test";

import { addCard, createBoard, signUp } from "./helpers";

const mainFilter = (page: Page): Promise<string> =>
  page.getByRole("main").evaluate((el) => getComputedStyle(el).filter);
const htmlFocus = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute("data-focus"));

async function seed(page: Page): Promise<void> {
  await signUp(page);
  await createBoard(page);
  await addCard(page, "To Do", "Apple");
  await addCard(page, "To Do", "Banana");
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
  await page.getByRole("button", { name: "Apple", exact: true }).click();
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
