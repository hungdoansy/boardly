import { expect, test, type Page } from "@playwright/test";

import { addCard, createBoard, signUp } from "./helpers";

// Regression (UNIT-10.1): the drag overlay is `position: fixed`. In Calm/Zen the
// content region (`<main data-focus-scope>`) carries a CSS `filter: saturate()`,
// which makes it the containing block for fixed descendants — so an overlay
// rendered inside `<main>` gets offset from the cursor by the header+sidebar.
// The overlay is portaled to <body>, so it must NOT be a descendant of <main>.

async function seed(page: Page): Promise<void> {
  await signUp(page);
  await createBoard(page);
  await addCard(page, "Todo", "Apple");
  await addCard(page, "Todo", "Banana");
}

/** True while a drag is held: is the floating title clone outside <main>? */
function overlayEscapesMain(page: Page, title: string): Promise<boolean> {
  return page.evaluate((t) => {
    const main = document.querySelector("main");
    if (!main) return false;
    const leaves = Array.from(document.body.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === t,
    );
    // The original card face keeps a leaf inside <main>; the drag overlay adds
    // an identical leaf that must live outside it (portaled to <body>).
    return leaves.some((el) => !main.contains(el));
  }, title);
}

test("drag overlay portals out of the focus-scoped region (tracks cursor in Zen)", async ({
  page,
}) => {
  await seed(page);

  // Cycle Off → Calm → Zen so the `saturate()` filter is on the content region.
  await page.keyboard.press("Shift+F");
  await page.keyboard.press("Shift+F");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-focus")))
    .toBe("zen");

  const card = page.getByRole("button", { name: "Card: Apple" });
  const box = await card.boundingBox();
  if (!box) throw new Error("card has no bounding box");

  // Press and move past the 5px activation distance, then hold mid-drag.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 6 });

  // While held, the overlay clone is outside <main> (portaled to <body>).
  await expect.poll(() => overlayEscapesMain(page, "Apple")).toBe(true);

  await page.mouse.up();
});
