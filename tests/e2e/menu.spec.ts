import { expect, type Page, test } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

// A real 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("admin builds a menu: category, product with image, price edit and sold-out switch", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByRole("heading", { name: "Menu", exact: true })).toBeVisible();

  await page.getByLabel("Name (Arabic)").fill("مشروبات ساخنة");
  await page.getByLabel("Name (English)").fill("Hot drinks");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("heading", { name: /Hot drinks/ })).toBeVisible();

  await page.getByRole("link", { name: "Add product" }).click();
  await page.getByLabel("Category").selectOption({ label: "Hot drinks · مشروبات ساخنة" });
  await page.getByRole("textbox", { name: "Price (EGP)" }).fill("45.555");
  await page.getByRole("textbox", { name: "Name (Arabic)" }).fill("لاتيه");
  await page.getByRole("textbox", { name: "Name (English)" }).fill("Latte");
  await page.getByLabel("Image (JPEG, PNG or WebP, up to 2 MB)").setInputFiles({ name: "latte.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "decimal places" })).toBeVisible();

  await page.getByRole("textbox", { name: "Price (EGP)" }).fill("45.50");
  await page.getByLabel("Image (JPEG, PNG or WebP, up to 2 MB)").setInputFiles({ name: "latte.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
  await expect(page.getByTestId("price-Latte")).toHaveText(/EGP\s45\.50/);

  // Sold-out switch.
  await page.getByRole("button", { name: "Mark Latte sold out" }).click();
  await expect(page.getByRole("button", { name: "Mark Latte available" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Latte/ })).toContainText("Sold out");

  // Edit the price; the stored image is kept and served as an image.
  await page.getByRole("link", { name: "Edit Latte" }).click();
  await expect(page.getByRole("textbox", { name: "Price (EGP)" })).toHaveValue("45.50");
  const imageSrc = await page.getByAltText("Current product image").getAttribute("src");
  expect(imageSrc).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
  const image = await page.request.get(imageSrc!);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");

  await page.getByRole("textbox", { name: "Price (EGP)" }).fill("52");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto("/admin/menu");
  await expect(page.getByTestId("price-Latte")).toHaveText(/EGP\s52\.00/);
});

test("an SVG disguised as a PNG is refused", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/menu/products/new");
  await page.getByLabel("Category").selectOption({ label: "Hot drinks · مشروبات ساخنة" });
  await page.getByRole("textbox", { name: "Price (EGP)" }).fill("30");
  await page.getByRole("textbox", { name: "Name (Arabic)" }).fill("شاي");
  await page.getByRole("textbox", { name: "Name (English)" }).fill("Tea");
  await page.getByLabel("Image (JPEG, PNG or WebP, up to 2 MB)").setInputFiles({
    name: "tea.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
  });
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Upload a JPEG, PNG or WebP image." })).toBeVisible();
});

test("admin creates a required Size group with priced options and links it to a product", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/menu");
  await page.getByRole("link", { name: "Option groups (sizes, extras)" }).click();
  await expect(page.getByRole("heading", { name: "Option groups", level: 1 })).toBeVisible();

  await page.getByRole("textbox", { name: "Name (Arabic)" }).fill("الحجم");
  await page.getByRole("textbox", { name: "Name (English)" }).fill("Size");
  await page.getByRole("spinbutton", { name: "Minimum choices" }).fill("2");
  await page.getByRole("spinbutton", { name: "Maximum choices" }).fill("1");
  await page.getByRole("button", { name: "Add group" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Maximum choices" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Minimum choices" }).fill("1");
  await page.getByRole("button", { name: "Add group" }).click();
  await expect(page.getByText("Customers must follow this rule: required, choose 1.")).toBeVisible();

  const add = page.getByRole("form", { name: "New option" });
  await add.getByRole("textbox", { name: "Name (Arabic)" }).fill("صغير");
  await add.getByRole("textbox", { name: "Name (English)" }).fill("Small");
  await add.getByRole("button", { name: "Add option" }).click();
  await expect(page.getByRole("form", { name: "Option Small" })).toBeVisible();
  await expect(add.getByRole("textbox", { name: "Name (English)" })).toHaveValue("");

  await add.getByRole("textbox", { name: "Name (Arabic)" }).fill("كبير");
  await add.getByRole("textbox", { name: "Name (English)" }).fill("Large");
  await add.getByRole("textbox", { name: "Extra price (EGP)" }).fill("10.50");
  await add.getByRole("button", { name: "Add option" }).click();
  await expect(page.getByRole("form", { name: "Option Large" }).getByRole("textbox", { name: "Extra price (EGP)" })).toHaveValue("10.50");

  await page.goto("/admin/menu");
  await page.getByRole("link", { name: "Edit Latte" }).click();
  await expect(page.getByRole("heading", { name: "Edit Latte" })).toBeVisible();
  const groups = page.getByRole("form", { name: "Option groups" });
  await groups.getByRole("checkbox", { name: /Size/ }).check();
  await groups.getByRole("button", { name: "Save option groups" }).click();
  await expect(groups.getByRole("status")).toHaveText("Option groups saved.");
  await page.reload();
  await expect(page.getByRole("form", { name: "Option groups" }).getByRole("checkbox", { name: /Size/ })).toBeChecked();
});

test("signed-out visitors cannot reach menu admin, and unknown media is 404", async ({ page, request }) => {
  await page.goto("/admin/menu");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/media/..%2F..%2Fpackage.json")).status()).toBe(404);
  expect((await request.get("/api/media/0190f3a2-7b1c-7def-8a9b-0123456789ab.png")).status()).toBe(404);
});
