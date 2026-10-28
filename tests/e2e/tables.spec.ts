import { type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

// Opens a customer link in a fresh, signed-out browser context.
async function openAsCustomer(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { page, close: () => context.close() };
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

test("admin creates table 12, gets its permanent QR code and the customer link works", async ({ page, browser }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Tables & QR codes" }).click();
  await page.getByLabel("Table number").fill("12");
  await page.getByLabel("Section (optional)").fill("Terrace");
  await page.getByRole("button", { name: "Create table" }).click();

  await expect(page.getByRole("heading", { name: "Table 12" })).toBeVisible();
  await expect(page.getByLabel("QR code for table 12").locator("svg")).toBeVisible();
  const orderUrl = (await page.getByTestId("order-url").textContent())!;
  expect(orderUrl).toMatch(/\/order\/table\/[A-Za-z0-9_-]{32}$/);

  const png = await page.request.get(page.url().replace("/admin/tables/", "/api/admin/tables/") + "/qr?format=png");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");

  // The customer opens the QR link without signing in.
  const customer = await openAsCustomer(browser, orderUrl);
  // The branch default language is Arabic until the customer switches.
  await expect(customer.page.getByTestId("table-number")).toHaveText("ترابيزة 12");
  await customer.close();

  // Editing the table keeps the same code (ADR-004).
  // Next keeps the previous route mounted but hidden, so match only visible fields by role.
  await page.getByRole("textbox", { name: "Name (optional)" }).fill("Window");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByTestId("order-url")).toHaveText(orderUrl);

  // A duplicate number is rejected with a clear message.
  await page.goto("/admin/tables");
  await page.getByLabel("Table number").fill("12");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByText("Table 12 already exists.")).toBeVisible();
});

test("regenerating the QR code retires the old printed code", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/admin/tables");
  await page.getByLabel("Table number").fill("30");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("heading", { name: "Table 30" })).toBeVisible();
  const oldUrl = (await page.getByTestId("order-url").textContent())!;

  await page.getByLabel("Reason").fill("Card damaged");
  await page.getByLabel("Type REGENERATE to confirm").fill("REGENERATE");
  await page.getByRole("button", { name: "Regenerate QR code" }).click();
  await expect(page.getByRole("status")).toContainText("New QR code issued");
  await page.reload();
  const newUrl = (await page.getByTestId("order-url").textContent())!;
  expect(newUrl).not.toBe(oldUrl);

  // The page streams, so a retired code shows the not-found page rather than an HTTP 404 status.
  const retired = await openAsCustomer(browser, oldUrl);
  await expect(retired.page.getByText("This link is not valid. Please scan the QR code on your table.")).toBeVisible();
  await expect(retired.page.getByTestId("table-number")).toHaveCount(0);
  await retired.close();
  const current = await openAsCustomer(browser, newUrl);
  await expect(current.page.getByTestId("table-number")).toHaveText("ترابيزة 30");
  await current.close();
});

test("the print card shows the restaurant, table number and QR code", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/tables");
  await page.getByRole("link", { name: "Open table 12" }).click();
  await page.getByRole("link", { name: "Print table card" }).click();
  await expect(page.getByTestId("card-table-number")).toHaveText("Table 12");
  await expect(page.getByText("My Restaurant")).toBeVisible();
  await expect(page.locator("article svg")).toBeVisible();
});

test("signed-out visitors cannot reach table admin or QR downloads", async ({ page, request }) => {
  await page.goto("/admin/tables");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/admin/tables/00000000-0000-0000-0000-000000000000/qr")).status()).toBe(401);
});
