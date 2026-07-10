import { expect, test } from "@playwright/test";

import { addCard, createBoard, openCard, signUp } from "./helpers";

test.describe("card detail", () => {
  test("edit description + priority, see activity, persist across reopen", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "To Do", "Fix the bug");

    await openCard(page, "Fix the bug");
    const dialog = page.getByRole("dialog", { name: "Fix the bug" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Description" }).fill("Steps to reproduce");

    await dialog.getByRole("button", { name: "Priority" }).click();
    await page.getByRole("menuitemradio", { name: "High" }).click();
    await expect(dialog.getByRole("button", { name: "Priority" })).toContainText("High");

    const activity = dialog.getByRole("list", { name: "Activity" });
    await expect(activity).toContainText("Priority");
    await expect(activity).toContainText("Created");

    // Close and reopen → the description persisted (Yjs + IndexedDB).
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await openCard(page, "Fix the bug");
    await expect(
      page
        .getByRole("dialog", { name: "Fix the bug" })
        .getByRole("textbox", { name: "Description" }),
    ).toHaveValue("Steps to reproduce");
  });
});
