import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { E2E_ADMIN } from "./global-setup";

// Cashier and kitchen screens (OPS-001..004) working together through live updates (ADR-014).
// Scenario B/C of SPEC §24: the kitchen moves a ticket and the cashier sees it without reloading.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const qrToken = randomBytes(24).toString("base64url");
const productId = uuidv7();

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branch.id}, 77, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branch.id}, 'مخبوزات', 'Bakery')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branch.id}, ${categoryId}, 'كرواسون', 'Croissant', 3500)`;
});

test.afterAll(async () => {
  await sql.end();
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

test("an order goes from the guest to the kitchen and the cashier, live", async ({ page, context, request }) => {
  await signIn(page);
  await page.goto("/admin/captains");
  await page.getByLabel("Name").first().fill("Mona");
  await page.getByRole("button", { name: "Add captain" }).click();
  await expect(page.getByRole("button", { name: "Save Mona" })).toBeVisible();

  await page.goto("/staff/kitchen");
  await expect(page.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  const cashier = await context.newPage();
  await cashier.goto("/staff/cashier");
  await expect(cashier.getByRole("heading", { name: "Cashier" })).toBeVisible();
  await expect(cashier.getByTestId("table-card-77")).toContainText("Available");

  const placed = await request.post("/api/public/orders", {
    data: { qrToken, items: [{ productId, quantity: 2, note: "Warm please" }] },
    headers: { "Idempotency-Key": randomBytes(16).toString("base64url") },
  });
  expect(placed.status()).toBe(201);
  const { orderRef } = await placed.json();

  // Both screens pick the order up without a reload.
  const ticket = page.getByRole("article", { name: `Table 77, order ${orderRef}` });
  await expect(ticket).toContainText("2× Croissant", { timeout: 8_000 });
  await expect(ticket).toContainText("Warm please");
  await expect(cashier.getByTestId("table-card-77")).toContainText("New order", { timeout: 8_000 });

  await ticket.getByRole("button", { name: "Start preparing" }).click();
  await expect(cashier.getByTestId("table-card-77")).toContainText("In preparation", { timeout: 8_000 });
  await ticket.getByRole("button", { name: "Ready" }).click();
  await expect(cashier.getByTestId("table-card-77")).toContainText("Ready", { timeout: 8_000 });

  await cashier.getByTestId("table-card-77").click();
  const card = cashier.getByTestId("cashier-order").filter({ hasText: orderRef });
  await card.getByLabel(`Captain for ${orderRef}`).selectOption({ label: "Mona" });
  await expect(cashier.getByRole("status")).toHaveText("Captain assigned.");
  await card.getByRole("button", { name: "Mark served" }).click();
  await expect(cashier.getByRole("status")).toHaveText("Marked as served.");
  await expect(card).toContainText("Served");
  await expect(cashier.getByTestId("table-card-77")).toContainText("Seated");
  // The kitchen's ready column empties once the order is served.
  await expect(page.getByRole("article", { name: `Table 77, order ${orderRef}` })).toHaveCount(0, { timeout: 8_000 });

  // Unpaid orders keep the table open.
  cashier.once("dialog", (d) => d.accept());
  await cashier.getByRole("button", { name: "Close table", exact: true }).click();
  await expect(cashier.getByRole("status")).toContainText(`Not settled yet: ${orderRef} (unpaid)`);
});

test("assistance requests reach the cashier and are handled once", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/staff/cashier");
  await expect(page.getByRole("heading", { name: "Cashier" })).toBeVisible();
  expect((await request.post("/api/public/assistance", { data: { qrToken } })).status()).toBe(201);
  const req = page.getByTestId("assistance-request").filter({ hasText: "Table 77" });
  await expect(req).toContainText("waiting", { timeout: 8_000 });
  await req.getByRole("button", { name: "On my way" }).click();
  await expect(req).toContainText("on the way");
  await req.getByRole("button", { name: "Done" }).click();
  await expect(req).toHaveCount(0);
});

test("operations screens need the right role", async ({ page }) => {
  await page.goto("/staff/cashier");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/staff/kitchen");
  await expect(page).toHaveURL(/\/login$/);
});
