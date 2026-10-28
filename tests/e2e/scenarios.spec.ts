import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { E2E_ADMIN } from "./global-setup";

// SPEC §24.3 end-to-end scenarios A–F and H, run against the real app: one table from creation to
// closing, seen at the same time by the guest, the kitchen and the cashier. Scenario G (duplicate
// submission) lives in orders.spec.ts; deeper concurrency and authorization checks are integration tests.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const kitchenEmail = `kitchen-${Date.now()}@example.com`;

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en, sort_order) values (${categoryId}, ${branch.id}, 'ركن السيناريو', 'Scenario corner', -5)`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values
            (${uuidv7()}, ${branch.id}, ${categoryId}, 'شاي نعناع', 'Mint tea', 2000),
            (${uuidv7()}, ${branch.id}, ${categoryId}, 'بسبوسة', 'Basbousa', 3000)`;
  await sql`insert into captains (id, branch_id, name) values (${uuidv7()}, ${branch.id}, 'Karim')`;
});

test.afterAll(async () => {
  await sql.end();
});

async function signIn(page: Page, email = E2E_ADMIN.email, password = E2E_ADMIN.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

async function guest(browser: Browser, url: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url.startsWith("/") ? `http://localhost:${process.env.E2E_PORT ?? 3100}${url}` : url);
  return page;
}

test("scenarios A–E: a table's full journey from QR code to closing", async ({ page: admin, context, browser }) => {
  test.setTimeout(120_000);
  let orderUrl = "";
  let orderRef = "";
  let guestPage: Page;
  const kitchen = await context.newPage();
  const cashier = await context.newPage();
  const tableCard = () => cashier.getByTestId("table-card-12");
  const ticket = () => kitchen.getByRole("article", { name: `Table 12, order ${orderRef}` });

  await test.step("A1–A3: admin creates table 12 and it appears on the cashier dashboard", async () => {
    await signIn(admin);
    await admin.goto("/admin/tables");
    await admin.getByLabel("Table number").fill("12");
    await admin.getByRole("button", { name: "Create table" }).click();
    await expect(admin.getByRole("heading", { name: "Table 12" })).toBeVisible();
    await expect(admin.getByLabel("QR code for table 12").locator("svg")).toBeVisible();
    orderUrl = (await admin.getByTestId("order-url").textContent())!;
    await kitchen.goto("/staff/kitchen");
    await cashier.goto("/staff/cashier");
    await expect(tableCard()).toContainText("Available");
  });

  await test.step("A4–A11: a signed-out guest orders two products in Arabic", async () => {
    guestPage = await guest(browser, orderUrl);
    await expect(guestPage.getByTestId("table-number")).toHaveText("ترابيزة 12");
    // Switch to English and back to Arabic, as a guest choosing the language would.
    await guestPage.getByRole("button", { name: "التبديل إلى الإنجليزية" }).click();
    await guestPage.getByRole("button", { name: "Switch to Arabic" }).click();
    await expect(guestPage.locator("html")).toHaveAttribute("dir", "rtl");
    await guestPage.getByRole("button", { name: "أضف شاي نعناع" }).click();
    await guestPage.getByRole("button", { name: "أضف بسبوسة" }).click();
    await expect(guestPage.getByTestId("cart-count")).toHaveText("2");
    await guestPage.getByRole("button", { name: /عرض السلة/ }).click();
    // 20.00 + 30.00 = 50.00, VAT 14% = 7.00, total 57.00 (server priced).
    await guestPage.getByRole("button", { name: /أرسل الطلب/ }).click();
    await guestPage.waitForURL(/\/order\/track\/[A-Za-z0-9_-]{32}$/);
    await expect(guestPage.getByTestId("order-status")).toHaveText("تم الاستلام");
    orderRef = (await guestPage.getByTestId("order-ref").textContent())!;
    expect(orderRef).toMatch(/^\d{8}-T012-0001$/);
    const [saved] = await sql`select total_minor::int as total from orders where order_ref = ${orderRef}`;
    expect(saved.total).toBe(5700);

    await expect(ticket()).toContainText("1× Mint tea", { timeout: 8_000 });
    await expect(ticket()).toContainText("1× Basbousa");
    await expect(tableCard()).toContainText("New order", { timeout: 8_000 });
  });

  await test.step("B: the kitchen accepts, prepares and readies the order; everyone sees it live", async () => {
    await ticket().getByRole("button", { name: "Accept" }).click();
    await expect(guestPage.getByTestId("order-status")).toHaveText("تم القبول", { timeout: 8_000 });
    await ticket().getByRole("button", { name: "Start preparing" }).click();
    await expect(tableCard()).toContainText("In preparation", { timeout: 8_000 });
    await expect(guestPage.getByTestId("order-status")).toHaveText("جاري التحضير", { timeout: 8_000 });
    await ticket().getByRole("button", { name: "Ready" }).click();
    await expect(tableCard()).toContainText("Ready", { timeout: 8_000 });
    await expect(guestPage.getByTestId("order-status")).toHaveText("جاهز", { timeout: 8_000 });
  });

  await test.step("C: the cashier assigns a captain and the order is served", async () => {
    await tableCard().click();
    const card = cashier.getByTestId("cashier-order").filter({ hasText: orderRef });
    await card.getByLabel(`Captain for ${orderRef}`).selectOption({ label: "Karim" });
    await expect(cashier.getByRole("status")).toHaveText("Captain assigned.");
    const [assignment] = await sql`select c.name, a.created_at from captain_assignments a join captains c on c.id = a.captain_id join orders o on o.id = a.order_id where o.order_ref = ${orderRef} and a.unassigned_at is null`;
    expect(assignment.name).toBe("Karim");
    expect(assignment.created_at).toBeInstanceOf(Date);
    await card.getByRole("button", { name: "Mark served" }).click();
    await expect(cashier.getByRole("status")).toHaveText("Marked as served.");
    await expect(guestPage.getByTestId("order-status")).toHaveText("تم التقديم", { timeout: 8_000 });
  });

  await test.step("D: the guest calls for help and staff acknowledge and resolve it", async () => {
    await guestPage.getByRole("link", { name: "رجوع للمنيو" }).click();
    await guestPage.getByRole("button", { name: /طلب مساعدة/ }).click();
    await expect(guestPage.getByText("أحد الموظفين جاي لك.")).toBeVisible();
    const req = cashier.getByTestId("assistance-request").filter({ hasText: "Table 12" });
    await expect(req).toContainText("waiting", { timeout: 8_000 });
    await req.getByRole("button", { name: "On my way" }).click();
    await expect(req).toContainText("on the way");
    await req.getByRole("button", { name: "Done" }).click();
    await expect(req).toHaveCount(0);
    const [row] = await sql`select a.status, a.acknowledged_by is not null as acked, a.resolved_by is not null as resolved from assistance_requests a join dining_tables t on t.id = a.table_id where t.number = 12 order by a.created_at desc limit 1`;
    expect(row).toEqual({ status: "RESOLVED", acked: true, resolved: true });
  });

  await test.step("E: payment, closing, history, and a new order with the same QR code", async () => {
    const card = cashier.getByTestId("cashier-order").filter({ hasText: orderRef });
    await card.getByLabel("Method").selectOption({ label: "Cash" });
    await card.getByRole("button", { name: "Record payment · EGP 57.00" }).click();
    await expect(cashier.getByRole("status")).toHaveText("Payment recorded.");
    await expect(card.getByTestId("payment-status")).toHaveText("paid");
    cashier.once("dialog", (d) => d.accept());
    await cashier.getByRole("button", { name: "Close table", exact: true }).click();
    await expect(cashier.getByRole("status")).toHaveText("Table closed.");
    await expect(tableCard()).toContainText("Available");

    await admin.goto("/admin/orders?table=12");
    await admin.getByRole("link", { name: orderRef }).click();
    await expect(admin.getByRole("heading", { name: `Order ${orderRef}` })).toBeVisible();
    await expect(admin.getByText(/Payment EGP\s57\.00 by Cash/)).toBeVisible();
    await expect(admin.getByText(/^Karim:/)).toBeVisible();
    await expect(admin.getByText(/DELIVERED/).first()).toBeVisible();

    // The printed QR code still works for the next guests and starts a new session and reference.
    const next = await guest(browser, orderUrl);
    await next.getByRole("button", { name: "أضف شاي نعناع" }).click();
    await next.getByRole("button", { name: /عرض السلة/ }).click();
    await next.getByRole("button", { name: /أرسل الطلب/ }).click();
    await next.waitForURL(/\/order\/track\//);
    const nextRef = (await next.getByTestId("order-ref").textContent())!;
    expect(nextRef).not.toBe(orderRef);
    const sessions = await sql`select distinct session_id from orders where order_ref in (${orderRef}, ${nextRef})`;
    expect(sessions).toHaveLength(2);
    await expect(tableCard()).toContainText("New order", { timeout: 8_000 });
  });
});

test("scenario F: access is denied where it should be, and prices come from the server", async ({ page, browser, request }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/staff/tables")).status()).toBe(401);

  // An admin creates a kitchen account; the kitchen user cannot reach menu prices or user admin.
  await signIn(page);
  await page.goto("/admin/users");
  await page.getByLabel("Name").fill("Kitchen Kamal");
  await page.getByLabel("Email").fill(kitchenEmail);
  await page.getByLabel("Role").selectOption("KITCHEN");
  await page.getByLabel("Temporary password").fill("kitchen-pass-1");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("status")).toContainText("User created");

  const kitchenContext = await browser.newContext();
  const kitchen = await kitchenContext.newPage();
  await signIn(kitchen, kitchenEmail, "kitchen-pass-1");
  for (const path of ["/admin/menu", "/admin/users", "/admin/settings", "/admin/reports", "/staff/cashier"]) {
    await kitchen.goto(path);
    await expect(kitchen).toHaveURL(/\/forbidden$/);
  }
  expect((await kitchen.request.get("/api/admin/reports/csv?section=daily")).status()).toBe(403);
  await kitchenContext.close();

  // A guessed sequential reference opens nothing.
  const [order] = await sql`select order_ref, tracking_token from orders order by created_at desc limit 1`;
  const guessed = await guest(browser, `/order/track/${order.order_ref}`);
  await expect(guessed.getByTestId("order-ref")).toHaveCount(0);
  await expect(guessed.getByText("الرابط ده غير صالح", { exact: false })).toBeVisible();
  expect((await request.get(`/api/public/orders/${order.order_ref}/events`)).status()).toBe(404);

  // A manipulated price in the request is ignored.
  const [table] = await sql`select qr_token from dining_tables where number = 12`;
  const [product] = await sql`select id from products where name_en = 'Basbousa'`;
  const placed = await request.post("/api/public/orders", {
    data: { qrToken: table.qr_token, items: [{ productId: product.id, quantity: 1, priceMinor: 1, unitPriceMinor: 1 }], totalMinor: 1 },
    headers: { "Idempotency-Key": randomBytes(16).toString("base64url") },
  });
  expect(placed.status()).toBe(201);
  expect((await placed.json()).totals.totalMinor).toBe(3420);
});

test("scenario H: two cashiers changing the same table at once get one success and one clear conflict", async ({ page }) => {
  await signIn(page);
  const [session] = await sql`select s.id, s.version from table_sessions s join dining_tables t on t.id = s.table_id where t.number = 12 and s.status <> 'CLOSED'`;
  const results = await Promise.all([
    page.request.post(`/api/staff/sessions/${session.id}/start-closing`, { data: { version: session.version } }),
    page.request.post(`/api/staff/sessions/${session.id}/start-closing`, { data: { version: session.version } }),
  ]);
  const statuses = results.map((r) => r.status()).sort();
  expect(statuses).toEqual([200, 409]);
  const conflict = results.find((r) => r.status() === 409)!;
  expect(await conflict.json()).toMatchObject({ code: expect.stringMatching(/CONFLICT|WRONG_STATUS/), message: expect.any(String) });
  const [after] = await sql`select count(*)::int as open from table_sessions s join dining_tables t on t.id = s.table_id where t.number = 12 and s.status <> 'CLOSED'`;
  expect(after.open).toBe(1);
});
