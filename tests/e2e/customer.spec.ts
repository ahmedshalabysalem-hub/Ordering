import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

// Customer ordering app (UI-001..005, ADR-013), driven through the browser like a guest's phone.
// Menu rows are inserted directly; the admin UI that creates them has its own tests.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const qrA = randomBytes(24).toString("base64url");
const qrB = randomBytes(24).toString("base64url");
const waterId = uuidv7();
let tableA = "";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  const flatWhite = uuidv7();
  const size = uuidv7();
  tableA = uuidv7();
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values
            (${tableA}, ${branch.id}, 41, ${qrA}), (${uuidv7()}, ${branch.id}, 42, ${qrB})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en, sort_order) values (${categoryId}, ${branch.id}, 'مشروبات الضيوف', 'Guest drinks', -1)`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, description_en, price_minor, sort_order) values
            (${flatWhite}, ${branch.id}, ${categoryId}, 'فلات وايت', 'Flat white', 'Double shot with steamed milk', 4550, 1),
            (${waterId}, ${branch.id}, ${categoryId}, 'مياه فوارة', 'Sparkling water', null, 1000, 2)`;
  await sql`insert into modifier_groups (id, branch_id, name_ar, name_en, min_select, max_select) values (${size}, ${branch.id}, 'الحجم', 'Cup size', 1, 1)`;
  await sql`insert into modifier_options (id, group_id, name_ar, name_en, price_delta_minor, sort_order) values
            (${uuidv7()}, ${size}, 'صغير', 'Regular', 0, 1), (${uuidv7()}, ${size}, 'كبير', 'Large', 1050, 2)`;
  await sql`insert into product_modifier_groups (product_id, group_id) values (${flatWhite}, ${size})`;
});

test.afterAll(async () => {
  await sql`update products set price_minor = 1000 where id = ${waterId}`;
  await sql.end();
});

const cartBar = (page: Page) => page.getByRole("button", { name: /View cart|عرض السلة/ });

async function toEnglish(page: Page) {
  await page.getByRole("button", { name: "التبديل إلى الإنجليزية" }).click();
  await expect(page.getByTestId("table-number")).toHaveText("Table 41");
}

test("a guest orders in Arabic and English, with options, and tracks the order", async ({ page }) => {
  await page.goto(`/order/table/${qrA}`);
  // The branch default is Arabic, right to left.
  await expect(page.getByTestId("table-number")).toHaveText("ترابيزة 41");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "مشروبات الضيوف" })).toBeVisible();
  await expect(page.getByRole("button", { name: "طلب مساعدة" })).toBeVisible();

  await toEnglish(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByText("Double shot with steamed milk")).toBeVisible();

  await page.getByRole("button", { name: "Add Sparkling water" }).click();
  await page.getByRole("button", { name: "Add Flat white" }).click();
  const sheet = page.getByRole("dialog", { name: "Flat white" });
  await sheet.getByRole("button", { name: /Add to cart/ }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Please choose: Cup size");
  await sheet.getByRole("radio", { name: "Large" }).check();
  await sheet.getByLabel("Note for this item").fill("Oat milk");
  await expect(sheet.getByRole("button", { name: "Add to cart · EGP 56.00" })).toBeVisible();
  await sheet.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("2");

  // The cart and the language survive a refresh.
  await page.reload();
  await expect(page.getByTestId("table-number")).toHaveText("Table 41");
  await expect(page.getByTestId("cart-count")).toHaveText("2");

  await cartBar(page).click();
  await expect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  // 10.00 + 56.00 = 66.00; VAT 14% = 9.24; total 75.24, priced by the server.
  await expect(page.getByTestId("cart-total")).toHaveText("EGP 75.24");
  await page.getByLabel("Note for the whole order").fill("By the window");
  await page.getByRole("button", { name: "Place order · EGP 75.24" }).click();

  await page.waitForURL(/\/order\/track\/[A-Za-z0-9_-]{32}$/);
  await expect(page.getByRole("heading", { name: "Order confirmation" })).toBeVisible();
  await expect(page.getByTestId("order-ref")).toHaveText(/^\d{8}-T041-\d{4}$/);
  await expect(page.getByTestId("order-status")).toHaveText("Received");
  await expect(page.getByTestId("payment-status")).toHaveText("Not paid yet");
  await expect(page.getByTestId("order-total")).toHaveText("EGP 75.24");
  await expect(page.getByText("Cup size: Large (+EGP 10.50)")).toBeVisible();
  await expect(page.getByText("This is an order confirmation, not a payment receipt.")).toBeVisible();
  const orderRef = (await page.getByTestId("order-ref").textContent())!;

  const [saved] = await sql`select customer_note, total_minor::int as total from orders where order_ref = ${orderRef}`;
  expect(saved).toEqual({ customer_note: "By the window", total: 7524 });

  // Status changes reach the open page.
  await sql`update orders set kitchen_status = 'IN_PREPARATION' where order_ref = ${orderRef}`;
  await expect(page.getByTestId("order-status")).toHaveText("Being prepared", { timeout: 25_000 });

  await page.getByRole("link", { name: "Back to the menu" }).click();
  await expect(page.getByTestId("table-number")).toHaveText("Table 41");
  await expect(cartBar(page)).toHaveCount(0);
  await page.getByText("My orders").click();
  await expect(page.getByRole("link", { name: orderRef })).toBeVisible();
});

test("a cart from another table is never sent there silently", async ({ page }) => {
  await page.goto(`/order/table/${qrA}`);
  await toEnglish(page);
  await page.getByRole("button", { name: "Add Sparkling water" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.goto(`/order/table/${qrB}`);
  await expect(page.getByRole("alertdialog")).toContainText("Your cart has items from table 41. This is table 42.");
  await expect(cartBar(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Start a new cart" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(cartBar(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Add Sparkling water" }).click();
  await page.goto(`/order/table/${qrA}`);
  await page.getByRole("button", { name: "Move the items to this table" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("the guest confirms a changed price before the order is placed", async ({ page }) => {
  await page.goto(`/order/table/${qrA}`);
  await toEnglish(page);
  await page.getByRole("button", { name: "Add Sparkling water" }).click();
  await cartBar(page).click();
  await expect(page.getByTestId("cart-total")).toHaveText("EGP 11.40");

  await sql`update products set price_minor = 1200 where id = ${waterId}`;
  await page.getByRole("button", { name: "Place order · EGP 11.40" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Some prices have changed" })).toBeVisible();
  await expect(page.getByTestId("cart-total")).toHaveText("EGP 13.68");
  await page.getByRole("button", { name: "Confirm new total · EGP 13.68" }).click();
  await page.waitForURL(/\/order\/track\//);
  await expect(page.getByTestId("order-total")).toHaveText("EGP 13.68");
  await sql`update products set price_minor = 1000 where id = ${waterId}`;
});

test("the assistance button calls staff once and confirms it", async ({ page }) => {
  await sql`delete from assistance_requests where table_id = ${tableA}`;
  await page.goto(`/order/table/${qrA}`);
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "أحد الموظفين جاي لك." })).toBeVisible();
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم نداء الموظفين بالفعل" })).toBeVisible();
  const rows = await sql`select status from assistance_requests where table_id = ${tableA}`;
  expect(rows.map((r) => r.status)).toEqual(["PENDING"]);
});

test("tracking links are unguessable and pages do not leak them", async ({ page, request }) => {
  const res = await page.goto(`/order/track/${randomBytes(24).toString("base64url")}`);
  await expect(page.getByText("This link is not valid. Please scan the QR code on your table.")).toBeVisible();
  expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
  const [order] = await sql`select order_ref from orders where table_id = ${tableA} limit 1`;
  if (order) {
    await page.goto(`/order/track/${order.order_ref}`);
    await expect(page.getByTestId("order-ref")).toHaveCount(0);
  }
  expect((await request.post("/api/public/assistance", { data: { qrToken: "x" } })).status()).toBe(404);
});
