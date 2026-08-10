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
  // Park the cursor off the column header: the click leaves the header "+" in
  // its hover state and reveals the hover-gated 3-dots menu, which would
  // otherwise bake into every visual baseline taken after seeding.
  await page.mouse.move(0, 0);
}

/** The sidebar's project navigation — scope project-row locators to this. */
export function projectsNav(page: Page) {
  return page.getByRole("navigation", { name: "Projects" });
}

/**
 * Create a project from the sidebar and give it `name`.
 *
 * Creating one also *selects* it (the row is a nav destination backed by the URL
 * hash), so the board is left scoped to the new project — which is how a spec
 * gets cards into it: a card added under a project scope inherits that project
 * from the active filter (UNIT-9.5).
 */
export async function createProject(page: Page, name: string): Promise<void> {
  const nav = projectsNav(page);
  await nav.getByRole("button", { name: "Add project" }).click();
  // Every new project starts as "New project"; rename it in place (UNIT-10.6).
  await nav.getByRole("button", { name: "New project", exact: true }).dblclick();
  const input = nav.getByRole("textbox", { name: "Rename New project" });
  await input.fill(name);
  await input.press("Enter");
  await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
}

/** Scope the board back to "All" (the sidebar's first project row). */
export async function selectAllProjects(page: Page): Promise<void> {
  await projectsNav(page).getByRole("button", { name: "All", exact: true }).click();
}

/**
 * Hide a project from its sidebar right-click menu (UNIT-10.5), which also takes
 * its cards out of the "All" view (UNIT-20).
 *
 * The trigger is scoped to the Projects nav and the menu item is matched exactly:
 * "Hide" is also a column 3-dots action (UNIT-18), so an unscoped, non-exact
 * locator collides with it.
 */
export async function hideProject(page: Page, name: string): Promise<void> {
  const nav = projectsNav(page);
  await nav.getByRole("button", { name, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide", exact: true }).click();
  // Hiding removes the row from the sidebar — the signal that the mutation landed.
  await expect(nav.getByRole("button", { name, exact: true })).toHaveCount(0);
}

/** The card face wrapper (aria-label "Card: <title>") — used for visibility checks. */
export function cardButton(page: Page, title: string) {
  return page.getByRole("button", { name: `Card: ${title}` });
}

/**
 * The clickable card face (`<article aria-label="Card: <title>">`). Since UNIT-9.7
 * the whole face opens the card — there is no inner title button any more — so
 * this, not a `button` named after the title, is what a click should target.
 */
export function cardFace(page: Page, title: string) {
  return page.getByRole("article", { name: `Card: ${title}` });
}

/** Open a card's detail by clicking its face (the wrapper around it is drag-only). */
export async function openCard(page: Page, title: string): Promise<void> {
  await cardFace(page, title).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
}
