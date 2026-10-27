import { expect, test } from "@playwright/test";

test("health endpoint reports the database is reachable", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", db: "ok" });
});

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ordering" })).toBeVisible();
});
