import { expect, type Page } from "@playwright/test";

let seq = 0;

/** A fresh account per test (the server never reveals if an email pre-existed). */
export function uniqueEmail(): string {
  seq += 1;
  return `e2e-${Date.now()}-${seq}@example.com`;
}

const PASSWORD = "correct horse battery staple";

/** Sign up (which also logs in) and land on the authenticated app shell. */
export async function signUp(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
  return email;
}

/** Log in an existing account and land on the app shell. */
export async function logIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
}

/** The columns a freshly created board is seeded with (see web `use-boards`). */
export const DEFAULT_COLUMNS = ["To Do", "Doing", "Done"] as const;

/** Create a board (via the empty-state CTA or the sidebar +) and open it. */
export async function createBoard(page: Page): Promise<void> {
  const cta = page.getByRole("button", { name: "Create board" });
  if (await cta.isVisible().catch(() => false)) {
    await cta.click();
  } else {
    await page.getByLabel("New board", { exact: true }).click();
  }
  // The board view renders its "Add column" affordance once a board is open,
  // then seeds the default columns — wait for the last one so specs can use them.
  await expect(page.getByRole("button", { name: "Add column" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Column: Done" })).toBeVisible();
}

export async function addColumn(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Add column" }).click();
  const input = page.getByRole("textbox", { name: "New column name" });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("region", { name: `Column: ${title}` })).toBeVisible();
}

export async function addCard(page: Page, columnTitle: string, cardTitle: string): Promise<void> {
  const column = page.getByRole("region", { name: `Column: ${columnTitle}` });
  await column.getByRole("button", { name: "Add card" }).click();
  const input = page.getByRole("textbox", { name: "New card title" });
  await input.fill(cardTitle);
  await input.press("Enter");
  await expect(column.getByRole("button", { name: `Card: ${cardTitle}` })).toBeVisible();
  await page.keyboard.press("Escape"); // close the composer
}

/** The card face wrapper (aria-label "Card: <title>") — used for visibility checks. */
export function cardButton(page: Page, title: string) {
  return page.getByRole("button", { name: `Card: ${title}` });
}

/** Open a card's detail by clicking its inner title button (the wrapper is drag-only). */
export async function openCard(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
}
