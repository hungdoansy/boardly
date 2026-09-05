import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import {
  addCard,
  createBoard,
  createProject,
  projectsNav,
  selectAllProjects,
  signUp,
} from "./helpers";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const fixture = (name: string): string => path.join(FIXTURES, name);

/**
 * Hand the hidden file input a file, exactly as the browser would. The input
 * lives inside the export popover, so the popover has to be open first — and
 * `setInputFiles` works on it despite `class="hidden"`, which is why no click on
 * "Import board…" is needed (that click only opens the OS picker).
 */
async function pickFile(page: Page, filePath: string): Promise<void> {
  // `exact` — once the popover is open, "Export as JSON" and "Export as
  // Markdown" both match a non-exact "Export".
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.getByText("Import into this board")).toBeVisible();
}

const modeButton = (page: Page, label: RegExp) => page.getByRole("button", { name: label });
// Scoped to the dialog: dnd-kit renders its own `role="status"` live region on
// every board page, so an unscoped locator is a strict-mode violation.
const report = (page: Page) => page.getByRole("dialog").getByRole("status");

/** Collect anything the browser complains about across a whole flow. */
function watchBrowser(page: Page): { errors: string[]; failed: string[] } {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) => {
    // An aborted request is normal here: navigating away cancels the websocket
    // and any in-flight fetch. Only a real transport failure is a defect.
    const reason = request.failure()?.errorText ?? "";
    if (!reason.includes("ERR_ABORTED"))
      failed.push(`${request.method()} ${request.url()} ${reason}`);
  });
  return { errors, failed };
}

test.describe("import modes (UNIT-21)", () => {
  test("exporting and merging the file straight back changes nothing (R15)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Keep me");
    await addCard(page, "Done", "Shipped");

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("button", { name: "Export as JSON" }).click();
    const download = await downloading;
    const saved = path.join(await mkdtemp(path.join(tmpdir(), "boardly-e2e-")), "board.json");
    await download.saveAs(saved);

    await pickFile(page, saved);
    await modeButton(page, /^Merge/).click();

    // Every card is already there and none is newer in the file, so the whole
    // import is a no-op the report can state plainly.
    await expect(report(page)).toContainText("left alone");
    await expect(report(page)).not.toContainText("added");
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("button", { name: "Card: Keep me" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Card: Shipped" })).toHaveCount(1);
  });

  test("merging a fixture creates one project and fuses the name-colliding one (AE2)", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);
    await createProject(page, "Web app");
    await selectAllProjects(page);

    await pickFile(page, fixture("board-v2.json"));
    await modeButton(page, /^Merge/).click();

    await expect(report(page)).toContainText("Joined by name");
    await expect(report(page)).toContainText("“web app” joined “Web app”");
    await expect(report(page)).toContainText("Cards: 3 added");
    await expect(report(page)).toContainText("Projects: 1 added");
    await page.getByRole("button", { name: "Done" }).click();

    // One "Web app" in the picker, not two — the whole point of the fusion rule.
    const nav = projectsNav(page);
    await expect(nav.getByRole("button", { name: "Web app", exact: true })).toHaveCount(1);
    await expect(nav.getByRole("button", { name: "Mobile", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Card: Fixture web card" })).toBeVisible();
  });

  test("replace loads the file behind its confirmation and keeps the device's zoom (AE4, R6)", async ({
    page,
  }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Gone after replace");

    await pickFile(page, fixture("board-v2.json"));
    await modeButton(page, /^Replace/).click();

    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText("Replace this board?");
    await expect(confirm).toContainText("1 card, 0 projects, 0 labels"); // being removed
    await expect(confirm).toContainText("3 cards, 2 projects, 1 label"); // arriving
    await expect(confirm).toContainText("Imported board");
    await expect(confirm).toContainText(/every signed-in device/i);

    // Cancelling is not the end of the flow — it returns to the choice.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Import into this board")).toBeVisible();

    // The modal hides the board from the accessibility tree (Radix marks its
    // siblings aria-hidden), so the board can only be asserted with it closed.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Import into this board")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Card: Gone after replace" })).toHaveCount(1);

    await pickFile(page, fixture("board-v2.json"));
    await modeButton(page, /^Replace/).click();
    await page.getByRole("button", { name: "Replace board" }).click();
    await expect(report(page)).toContainText("Cards: 3 added");
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("button", { name: "Card: Gone after replace" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Card: Fixture web card" })).toBeVisible();
    // The file asks for zoom 1.5; zoom is this device's, not the file's (R6).
    await expect(page.locator("html")).not.toHaveCSS("zoom", "1.5");
  });

  test("a file written before projects existed still imports (AE6, R2)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    // Watch from here on: the signed-out page load probes the session and takes
    // an expected 401, which is not part of the flow under test.
    const watch = watchBrowser(page);

    await pickFile(page, fixture("board-v1.json"));
    await modeButton(page, /^Replace/).click();
    await page.getByRole("button", { name: "Replace board" }).click();
    await expect(report(page)).toContainText("Cards: 2 added");
    await page.getByRole("button", { name: "Done" }).click();

    await expect(
      page.getByRole("button", { name: "Card: Card from before projects existed" }),
    ).toBeVisible();
    // A v1 file has no projects, so nothing joined the sidebar beyond "All".
    await expect(projectsNav(page).getByRole("button", { name: "Mobile" })).toHaveCount(0);

    expect(watch.errors).toEqual([]);
    expect(watch.failed).toEqual([]);
  });

  test("dark-theme mode picker matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Design the dashboard");

    await pickFile(page, fixture("board-v2.json"));
    await expect(modeButton(page, /^Replace/)).toBeVisible();
    // Scoped to the dialog, not the page. A full-page baseline at this repo's
    // usual 0.03 ratio cannot see a rewritten sentence inside a 400px dialog —
    // the changed pixels stay well under the threshold and the stale baseline
    // keeps passing. The dialog is also what DESIGN.md §7.6 describes.
    await expect(page.getByRole("dialog")).toHaveScreenshot("import-modes-dark.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("dark-theme replace confirmation matches the visual baseline", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await addCard(page, "Todo", "Design the dashboard");

    await pickFile(page, fixture("board-v2.json"));
    await modeButton(page, /^Replace/).click();
    await expect(page.getByRole("button", { name: "Replace board" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveScreenshot("import-replace-confirm-dark.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
