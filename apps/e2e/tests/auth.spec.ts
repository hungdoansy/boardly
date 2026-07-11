import { expect, test } from "@playwright/test";

import { logIn, signUp, uniqueEmail } from "./helpers";

test.describe("auth", () => {
  test("signup establishes a session and lands on the app", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
    // Boardly auto-provisions a single "Main board" (no create-board prompt).
    await expect(page.getByRole("button", { name: "Add column" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create board" })).toHaveCount(0);
  });

  test("an unauthenticated visit redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("wrong password shows a generic error and no session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("logout returns to /login; the account can log back in", async ({ page }) => {
    const email = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\/?$/);
    await logIn(page, email);
    await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
  });
});
