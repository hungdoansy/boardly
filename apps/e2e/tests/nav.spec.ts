import { expect, test } from "@playwright/test";

import { createBoard, signUp } from "./helpers";

test.describe("navigation: Settings placement & ESC ladder", () => {
  test("Settings is the last sidebar nav item, above the account footer (R12)", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);

    const projects = page.getByRole("navigation", { name: "Projects" });
    const settings = page.getByRole("button", { name: "Settings" });
    const account = page.getByRole("button", { name: "Account" });
    await expect(settings).toBeVisible();

    // Top-to-bottom: projects list → Settings → account footer.
    const projectsBox = await projects.boundingBox();
    const settingsBox = await settings.boundingBox();
    const accountBox = await account.boundingBox();
    expect(projectsBox!.y).toBeLessThan(settingsBox!.y);
    expect(settingsBox!.y).toBeLessThan(accountBox!.y);
  });

  test("Settings opens the pane; ESC returns to the board (R13)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeHidden();
    await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
  });

  test("ESC resets project scope to All (R13)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // Creating a project selects it (scopes the board to it).
    await page.getByRole("button", { name: "Add project" }).click();
    const scoped = page.getByRole("button", { name: "New project" });
    await expect(scoped).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await expect(scoped).toHaveAttribute("aria-pressed", "false");
  });
});
