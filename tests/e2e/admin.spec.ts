import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { E2E_ADMIN } from "./global-setup";

// Admin area (ADM-001..006): users and roles, settings, suppliers, reports with CSV, order history and
// the audit log, plus the role boundary between an admin and a cashier.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const qrToken = randomBytes(24).toString("base64url");
const productId = uuidv7();
const tableNumber = 500 + Math.floor(Math.random() * 400);
const cashierEmail = `cashier-${Date.now()}@example.com`;

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branch.id}, ${tableNumber}, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branch.id}, 'حلويات', 'Desserts')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branch.id}, ${categoryId}, 'كنافة', 'Kunafa', 6000)`;
});

test.afterAll(async () => {
  await sql.end();
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

test("an admin manages users, settings and suppliers, and a new cashier gets only cashier access", async ({ page }) => {
  await signIn(page, E2E_ADMIN.email, E2E_ADMIN.password);

  await page.goto("/admin/users");
  await page.getByLabel("Name").fill("Hana");
  await page.getByLabel("Email").fill(cashierEmail);
  await page.getByLabel("Role").selectOption("CASHIER");
  await page.getByLabel("Temporary password").fill("cashier-pass-1");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("status")).toContainText("User created");
  await expect(page.getByRole("cell", { name: cashierEmail })).toBeVisible();

  // The only admin cannot remove their own access.
  // Open the edit page with a full load: right after a client-side navigation Next can remount the
  // streamed form once more, which would undo a selection made in the first second.
  await page.goto((await page.getByRole("link", { name: `Edit ${E2E_ADMIN.name}` }).getAttribute("href"))!);
  await page.getByRole("combobox", { name: "Role" }).selectOption("CASHIER");
  await page.getByRole("button", { name: "Save user" }).click();
  await expect(page.getByText("You cannot remove your own admin access")).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByLabel("Tax rate (%)")).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await page.getByLabel("Code").fill("WALLET");
  await page.getByLabel("Name (Arabic)").last().fill("محفظة");
  await page.getByLabel("Name (English)").last().fill("Wallet");
  await page.getByRole("button", { name: "Add method" }).click();
  await expect(page.getByRole("button", { name: "Disable Wallet" })).toBeVisible();

  await page.goto("/admin/suppliers");
  await page.getByLabel("Name").fill("Nile Dairy");
  await page.getByLabel("Phone").fill("01000000000");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.locator("summary", { hasText: "Nile Dairy" })).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByRole("listitem").filter({ hasText: "USER_CREATED" }).first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "SUPPLIER_CREATED" }).first()).toBeVisible();

  // Sign out and in as the new cashier.
  await page.goto("/staff");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, cashierEmail, "cashier-pass-1");
  await expect(page.getByRole("link", { name: "Cashier" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Menu" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("reports, CSV and order history reflect real orders and payments", async ({ page, request }) => {
  const placed = await request.post("/api/public/orders", {
    data: { qrToken, items: [{ productId, quantity: 2 }] },
    headers: { "Idempotency-Key": randomBytes(16).toString("base64url") },
  });
  expect(placed.status()).toBe(201);
  const { orderRef } = await placed.json();

  await signIn(page, E2E_ADMIN.email, E2E_ADMIN.password);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Active orders")).toBeVisible();

  await page.goto("/admin/reports");
  const products = page.getByRole("region", { name: "Top-selling products" });
  await expect(products.getByRole("row", { name: /Kunafa/ })).toContainText("2");
  await expect(page.getByTestId("report-totals")).toBeVisible();
  const csv = await page.request.get(await page.getByRole("region", { name: "Sales by day" }).getByRole("link", { name: "Download CSV" }).getAttribute("href").then((h) => h!));
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toMatch(/^date,orders,cancelled,gross/);

  await page.goto("/admin/orders");
  await page.getByRole("textbox", { name: "Table" }).fill(String(tableNumber));
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("link", { name: orderRef }).click();
  await expect(page.getByRole("heading", { name: `Order ${orderRef}` })).toBeVisible();
  await expect(page.getByText("2 × Kunafa")).toBeVisible();
  await expect(page.getByText("No payments recorded.")).toBeVisible();
  await expect(page.getByText(/ORDER_CREATED/)).toBeVisible();

  // Signed-out access to the CSV is refused.
  const anonymous = await request.get("/api/admin/reports/csv?section=daily");
  expect(anonymous.status()).toBe(401);
});
