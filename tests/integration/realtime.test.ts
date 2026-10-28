import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db/client";
import { requestAssistance } from "@/server/customer/assistance";
import { createOrder } from "@/server/orders/create";
import { publish, type RealtimeEvent } from "@/server/realtime/events";
import { subscribe } from "@/server/realtime/hub";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function seed() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const tableId = uuidv7();
  const qrToken = randomBytes(24).toString("base64url");
  const categoryId = uuidv7();
  const productId = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency) values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into branch_settings (branch_id) values (${branchId})`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${tableId}, ${branchId}, 9, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'م', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branchId}, ${categoryId}, 'مياه', 'Water', 1000)`;
  return { branchId, tableId, qrToken, productId };
}

/** Collects this branch's events until `count` arrive or the timeout passes. */
async function collect(branchId: string, action: () => Promise<unknown>, count: number, timeoutMs = 3000) {
  const seen: RealtimeEvent[] = [];
  let done: () => void = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  const unsubscribe = await subscribe((e) => {
    if (e.branchId !== branchId) return;
    seen.push(e);
    if (seen.length >= count) done();
  });
  await action();
  await Promise.race([finished, new Promise((r) => setTimeout(r, timeoutMs))]);
  unsubscribe();
  return seen;
}

describe("real-time events (RT-001, ADR-014)", () => {
  it("announces a committed order and an assistance request with ids only", async () => {
    const s = await seed();
    let orderId = "";
    const events = await collect(
      s.branchId,
      async () => {
        orderId = (await createOrder({ qrToken: s.qrToken, items: [{ productId: s.productId, quantity: 1, note: "secret note" }] }, randomBytes(16).toString("base64url"))).orderId;
        await requestAssistance(s.qrToken);
      },
      2,
    );
    expect(events.map((e) => e.type)).toEqual(["order.created", "assistance.updated"]);
    expect(events[0]).toMatchObject({ branchId: s.branchId, orderId, tableId: s.tableId });
    expect(JSON.stringify(events)).not.toContain("secret note");
  });

  it("sends nothing when the transaction rolls back", async () => {
    const s = await seed();
    const events = await collect(
      s.branchId,
      () =>
        db
          .transaction(async (tx) => {
            await publish(tx, { type: "order.updated", branchId: s.branchId });
            throw new Error("rollback");
          })
          .catch(() => {}),
      1,
      800,
    );
    expect(events).toEqual([]);
  });
});
