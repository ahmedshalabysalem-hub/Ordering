import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

test("staff pages redirect to sign-in when signed out", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
});

test("a wrong password shows an error and stays on sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("the bootstrapped admin can sign in and out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { name: `Signed in as ${E2E_ADMIN.name}` })).toBeVisible();
  await expect(page.getByText(`${E2E_ADMIN.email} · ADMIN`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login$/);
});
