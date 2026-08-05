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
  await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
  return email;
}

/** Log in an existing account and land on the app shell. */
export async function logIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
}

/**
 * The fixed Linear status columns the board always renders (Unit 9). Columns are
 * derived from the domain `STATUS_ORDER` — they cannot be added, renamed, or
 * reordered. A card's column IS its status.
 */
export const STATUS_COLUMNS = [
  "Backlog",
  "Todo",
  "In Progress",
  "Pending",
  "In Review",
  "Done",
  "Canceled",
  "Duplicate",
] as const;

/**
 * Wait for the single per-user board to be open with its fixed status columns.
 * Boardly is single-board (Unit 2) with fixed status columns (Unit 9): there is
 * no board to create or column to add — specs just wait for it to be ready.
 */
export async function createBoard(page: Page): Promise<void> {
  await expect(page.getByRole("region", { name: "Column: Todo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Column: Done" })).toBeVisible();
}

export async function addCard(page: Page, columnTitle: string, cardTitle: string): Promise<void> {
  const column = page.getByRole("region", { name: `Column: ${columnTitle}` });
  // `exact` so we don't also match the "Add card with details" icon button, and
  // scoped to the header because UNIT-13 gave the header a "+" carrying the same
  // aria-label as the footer composer button — unscoped, this matches both.
  await column.locator("header").getByRole("button", { name: "Add card", exact: true }).click();
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
