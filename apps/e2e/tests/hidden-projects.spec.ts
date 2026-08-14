import { expect, type Page, test } from "@playwright/test";

import {
  addCard,
  cardButton,
  createBoard,
  createProject,
  hideProject,
  selectAllProjects,
  signUp,
} from "./helpers";

/*
 * Hiding a project hides its cards (UNIT-20): in the "All" scope they leave the
 * board, the column counts, the bulk actions and both search surfaces, while the
 * project's own URL and an opt-in search toggle still reach them.
 *
 * Why a behavioral spec and not a baseline: the `board-dark` screenshot runs at
 * `maxDiffPixelRatio: 0.03`, which comfortably absorbs a couple of cards
 * disappearing from a column. Nothing here is asserted in pixels.
 *
 * The fixture is built in-test rather than read from the seeded demo account —
 * every spec in this directory signs up a throwaway account, and sharing the
 * demo board would couple the specs to each other and to the seed's contents.
 */

const HIDDEN_PROJECT = "Legacy platform";
const VISIBLE_PROJECT = "Web app";

// Two hidden-project cards, one visible-project card and one unassigned card —
// all in Backlog, so one column exercises R1 (hidden gone), R2 (unassigned
// stays) and R3 (the count matches what is rendered) at once.
const HIDDEN_CARD = "Retire the cron scheduler";
const HIDDEN_CARDS = [HIDDEN_CARD, "Decommission the legacy queue"];
const VISIBLE_CARD = "Ship the new nav";
const UNASSIGNED_CARD = "Unfiled note";

/**
 * Build the board and hide the project, returning the hidden project's URL
 * (captured while it was the active scope — the only way back to it once the
 * sidebar row is gone).
 */
async function setUpHiddenProject(page: Page): Promise<{ hiddenUrl: string }> {
  await signUp(page);
  await createBoard(page);

  // Creating a project selects it, and a card added under a project scope
  // inherits that project from the active filter (UNIT-9.5) — that is how these
  // cards get their `projectId` without touching the card detail.
  await createProject(page, HIDDEN_PROJECT);
  for (const title of HIDDEN_CARDS) await addCard(page, "Backlog", title);
  const hiddenUrl = page.url();

  await createProject(page, VISIBLE_PROJECT);
  await addCard(page, "Backlog", VISIBLE_CARD);

  await selectAllProjects(page);
  await addCard(page, "Backlog", UNASSIGNED_CARD);

  // Guard the fixture itself: before the hide, "All" shows all four. Without
  // this a spec that silently created nothing would still "pass" the absence
  // assertions below.
  const backlog = page.getByRole("region", { name: "Column: Backlog" });
  await expect(backlog.getByRole("article", { name: /^Card: / })).toHaveCount(4);

  await hideProject(page, HIDDEN_PROJECT);
  return { hiddenUrl };
}

test.describe("hidden projects", () => {
  test("the All scope drops their cards from the board, the count, and the bulk action", async ({
    page,
  }) => {
    await setUpHiddenProject(page);

    // R1 — gone from the board entirely (not merely from one column).
    for (const title of HIDDEN_CARDS) {
      await expect(cardButton(page, title)).toHaveCount(0);
    }
    // R2 — a card with no project is untouched, and so is the visible project's.
    await expect(cardButton(page, VISIBLE_CARD)).toBeVisible();
    await expect(cardButton(page, UNASSIGNED_CARD)).toBeVisible();

    // R3 — the header count is the number of faces the column actually renders.
    // The count has no accessible name of its own (it is a bare span beside the
    // status name), so it is matched as the header's only all-digits text.
    const backlog = page.getByRole("region", { name: "Column: Backlog" });
    await expect(backlog.getByRole("article", { name: /^Card: / })).toHaveCount(2);
    await expect(backlog.locator("header").getByText(/^\d+$/)).toHaveText("2");

    // R3 — the bulk action counts the same cards the column shows. Confirming it
    // is not the point (UNIT-19 covers that); the count in the prompt is.
    await page.getByRole("button", { name: "Backlog column actions" }).click();
    await page.getByRole("menuitem", { name: "Mark all done" }).click();
    await expect(
      page.getByRole("heading", { name: "Mark all 2 cards in Backlog as done?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("their own URL still shows their cards (R8)", async ({ page }) => {
    const { hiddenUrl } = await setUpHiddenProject(page);

    // Explicit scope beats the All-view exclusion — otherwise hiding a project
    // would make its cards unreachable outside search.
    await page.goto(hiddenUrl);
    for (const title of HIDDEN_CARDS) {
      await expect(cardButton(page, title)).toBeVisible();
    }
    // …and the scope is real: cards from elsewhere are filtered out here.
    await expect(cardButton(page, UNASSIGNED_CARD)).toHaveCount(0);
  });

  test("⌘K finds their cards only with 'Include hidden projects' on", async ({ page }) => {
    await setUpHiddenProject(page);

    // Every locator below is scoped to the palette: the same "Include hidden
    // projects" label also exists in the `/` search dialog, and an unscoped
    // `getByRole("option", …)` would be a strict-mode violation the moment both
    // surfaces are reachable.
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder("Type a command or search…").fill("cron");

    // R4 — excluded by default. The toggle row must survive the query (it is
    // force-mounted); a filtered-away row would be missing exactly when it is
    // needed, in front of "No results.".
    const toggle = palette.getByRole("option", { name: "Include hidden projects" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(palette.getByRole("option", { name: new RegExp(HIDDEN_CARD) })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // Flipping the switch leaves the palette open on the results it revealed.
    await expect(palette).toBeVisible();

    // R7 — the revealed result names the hidden project it came from.
    const result = palette.getByRole("option", { name: new RegExp(HIDDEN_CARD) });
    await expect(result).toBeVisible();
    await expect(result).toContainText(HIDDEN_PROJECT);

    // R6 — closing with ⌘K (the route that bypasses the dialog's own
    // `onOpenChange`) still resets the switch on the next open.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeHidden();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await palette.getByPlaceholder("Type a command or search…").fill("cron");
    await expect(palette.getByRole("option", { name: new RegExp(HIDDEN_CARD) })).toHaveCount(0);
  });
});
