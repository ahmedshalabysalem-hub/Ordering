import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { E2E_ADMIN } from "./global-setup";

// Live updates (RT-001, ADR-014): staff get their branch's events; anonymous callers get nothing.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const qrToken = randomBytes(24).toString("base64url");
const productId = uuidv7();

test.beforeAll(async () => {
  const [branch] = await sql`select id from branches order by created_at limit 1`;
  const categoryId = uuidv7();
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branch.id}, 61, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branch.id}, 'حي', 'Live')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branch.id}, ${categoryId}, 'شاي', 'Live tea', 1500)`;
});

test.afterAll(async () => {
  await sql.end();
});

test("signed-in staff receive a new order on the live stream", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/);

  // Open the stream in the signed-in browser and wait for the first order event.
  const received = page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const source = new EventSource("/api/staff/events");
        source.onmessage = (m) => {
          const data = JSON.parse(m.data);
          if (data.type === "order.created") {
            source.close();
            resolve(data);
          }
        };
        source.onopen = () => document.body.setAttribute("data-live", "open");
        setTimeout(() => reject(new Error("no event")), 10_000);
      }),
  );
  await expect(page.locator("body")).toHaveAttribute("data-live", "open");

  const order = await request.post("/api/public/orders", {
    data: { qrToken, items: [{ productId, quantity: 1, note: "private" }] },
    headers: { "Idempotency-Key": randomBytes(16).toString("base64url") },
  });
  expect(order.status()).toBe(201);
  const { orderId } = await order.json();
  const event = (await received) as Record<string, unknown>;
  expect(event).toMatchObject({ type: "order.created", orderId });
  expect(JSON.stringify(event)).not.toContain("private");
});

test("live streams refuse anonymous staff callers and unknown order links", async ({ request }) => {
  expect((await request.get("/api/staff/events")).status()).toBe(401);
  expect((await request.get(`/api/public/orders/${randomBytes(24).toString("base64url")}/events`)).status()).toBe(404);
});
