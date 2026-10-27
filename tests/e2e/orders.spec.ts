import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

// Public order API over real HTTP (ORD-001, ADR-012). Menu rows are inserted directly; the admin UI
// that creates them has its own tests.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const qrToken = randomBytes(24).toString("base64url");
const waterId = uuidv7();

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branch.id}, 88, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branch.id}, 'مياه', 'Water')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor)
            values (${waterId}, ${branch.id}, ${categoryId}, 'مياه', 'Still water', 1000)`;
});

test.afterAll(async () => {
  await sql.end();
});

const cart = () => ({ qrToken, items: [{ productId: waterId, quantity: 2 }] });

test("a customer gets a quote and places an order once, even when the submit is retried", async ({ request }) => {
  const quote = await request.post("/api/public/orders/quote", { data: cart() });
  expect(quote.status()).toBe(200);
  // 2 × 10.00 + VAT 14% (seeded by the bootstrap) = 22.80
  expect((await quote.json()).totals.totalMinor).toBe(2280);

  expect((await request.post("/api/public/orders", { data: cart() })).status()).toBe(400);

  const headers = { "Idempotency-Key": randomBytes(16).toString("base64url") };
  const first = await request.post("/api/public/orders", { data: { ...cart(), expectedTotalMinor: 2280 }, headers });
  expect(first.status()).toBe(201);
  const order = await first.json();
  expect(order.orderRef).toMatch(/^\d{8}-T088-0001$/);
  expect(order.trackingToken).not.toBe(qrToken);

  const retry = await request.post("/api/public/orders", { data: { ...cart(), expectedTotalMinor: 2280 }, headers });
  expect(retry.status()).toBe(201);
  expect((await retry.json()).orderId).toBe(order.orderId);
  const [{ count }] = await sql`select count(*)::int as count from orders where order_ref like '%-T088-%'`;
  expect(count).toBe(1);
});

test("the order API explains what went wrong", async ({ request }) => {
  const key = () => ({ "Idempotency-Key": randomBytes(16).toString("base64url") });

  const unknown = await request.post("/api/public/orders", { data: { ...cart(), qrToken: randomBytes(24).toString("base64url") }, headers: key() });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).code).toBe("TABLE_NOT_FOUND");

  const changed = await request.post("/api/public/orders", { data: { ...cart(), expectedTotalMinor: 1 }, headers: key() });
  expect(changed.status()).toBe(409);
  const body = await changed.json();
  expect(body.code).toBe("PRICES_CHANGED");
  expect(body.quote.totals.totalMinor).toBe(2280);

  const malformed = await request.post("/api/public/orders", { data: "not json", headers: { ...key(), "Content-Type": "application/json" } });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).code).toBe("INVALID_REQUEST");

  // Prices from the browser are ignored: there is simply no field for them.
  const injected = await request.post("/api/public/orders", {
    data: { qrToken, items: [{ productId: waterId, quantity: 1, unitPriceMinor: 1 }] },
    headers: key(),
  });
  expect(injected.status()).toBe(201);
  expect((await injected.json()).totals.subtotalMinor).toBe(1000);
});

test("table and session staff APIs refuse anonymous callers", async ({ request }) => {
  expect((await request.get("/api/staff/tables")).status()).toBe(401);
  const close = await request.post(`/api/staff/sessions/${uuidv7()}/close`, { data: { version: 1 } });
  expect(close.status()).toBe(401);
});
