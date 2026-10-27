import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { createOrder, OrderError, type OrderRequest, quoteOrder } from "@/server/orders/create";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

const key = () => randomBytes(16).toString("base64url");
const qr = () => randomBytes(24).toString("base64url");

/** A branch with VAT 14% exclusive, one table, a Latte with a required Size group, Water and a sold-out Cake. */
async function seedMenu() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const tableId = uuidv7();
  const qrToken = qr();
  const categoryId = uuidv7();
  const latte = uuidv7();
  const water = uuidv7();
  const cake = uuidv7();
  const size = uuidv7();
  const small = uuidv7();
  const large = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency)
            values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into branch_settings (branch_id) values (${branchId})`;
  await sql`insert into tax_rates (id, branch_id, name, rate_bps) values (${uuidv7()}, ${branchId}, 'VAT', 1400)`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${tableId}, ${branchId}, 7, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'مشروبات', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor, is_available) values
            (${latte}, ${branchId}, ${categoryId}, 'لاتيه', 'Latte', 4550, true),
            (${water}, ${branchId}, ${categoryId}, 'مياه', 'Water', 1000, true),
            (${cake}, ${branchId}, ${categoryId}, 'كيك', 'Cake', 3000, false)`;
  await sql`insert into modifier_groups (id, branch_id, name_ar, name_en, min_select, max_select) values (${size}, ${branchId}, 'الحجم', 'Size', 1, 1)`;
  await sql`insert into modifier_options (id, group_id, name_ar, name_en, price_delta_minor, sort_order) values
            (${small}, ${size}, 'صغير', 'Small', 0, 1), (${large}, ${size}, 'كبير', 'Large', 1050, 2)`;
  await sql`insert into product_modifier_groups (product_id, group_id) values (${latte}, ${size})`;
  return { branchId, tableId, qrToken, categoryId, latte, water, cake, size, small, large };
}

type Menu = Awaited<ReturnType<typeof seedMenu>>;

// 2 × Large Latte (45.50 + 10.50) + 1 Water (10.00) = 122.00; VAT 14% = 17.08; total 139.08
const cart = (m: Menu, extra: Partial<OrderRequest> = {}): OrderRequest => ({
  qrToken: m.qrToken,
  items: [
    { productId: m.latte, quantity: 2, optionIds: [m.large], note: "Oat milk" },
    { productId: m.water, quantity: 1 },
  ],
  customerNote: "By the window",
  ...extra,
});

async function rejection(promise: Promise<unknown>): Promise<OrderError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof OrderError) return e;
    throw e;
  }
  throw new Error("expected an OrderError");
}

describe("customer order creation (ORD-001, ADR-012)", () => {
  it("prices on the server, snapshots names and options, and numbers the order per table and day", async () => {
    const m = await seedMenu();
    const order = await createOrder(cart(m), key());

    expect(order.totals).toEqual({ subtotalMinor: 12200, discountMinor: 0, taxMinor: 1708, serviceMinor: 0, totalMinor: 13908 });
    expect(order.orderRef).toMatch(/^\d{8}-T007-0001$/);
    expect(order.trackingToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(order.trackingToken).not.toBe(m.qrToken);

    const [row] = await sql`select o.*, s.status as session_status from orders o join table_sessions s on s.id = o.session_id where o.id = ${order.orderId}`;
    expect(row).toMatchObject({ kitchen_status: "NEW", payment_status: "UNPAID", session_status: "OPEN", table_number_snapshot: 7, customer_note: "By the window" });
    const items = await sql`select name_en_snapshot, unit_price_minor, modifiers_total_minor, quantity, line_total_minor, note
                            from order_items where order_id = ${order.orderId} order by name_en_snapshot`;
    expect(items.map((i) => ({ ...i }))).toEqual([
      { name_en_snapshot: "Latte", unit_price_minor: "4550", modifiers_total_minor: "1050", quantity: 2, line_total_minor: "11200", note: "Oat milk" },
      { name_en_snapshot: "Water", unit_price_minor: "1000", modifiers_total_minor: "0", quantity: 1, line_total_minor: "1000", note: null },
    ]);
    const [mod] = await sql`select group_name_en_snapshot, option_name_en_snapshot, price_delta_minor from order_item_modifiers m
                            join order_items i on i.id = m.order_item_id where i.order_id = ${order.orderId}`;
    expect({ ...mod }).toEqual({ group_name_en_snapshot: "Size", option_name_en_snapshot: "Large", price_delta_minor: "1050" });
    const events = await sql`select type, to_status from order_events where order_id = ${order.orderId}`;
    expect(events.map((e) => ({ ...e }))).toEqual([{ type: "ORDER_CREATED", to_status: "NEW" }]);

    // Later menu changes never touch the stored order (SPEC §14.3).
    await sql`update products set price_minor = 9999, name_en = 'Renamed' where id = ${m.latte}`;
    await sql`update modifier_options set price_delta_minor = 5000 where id = ${m.large}`;
    const [after] = await sql`select line_total_minor, name_en_snapshot from order_items where order_id = ${order.orderId} and product_id = ${m.latte}`;
    expect({ ...after }).toEqual({ line_total_minor: "11200", name_en_snapshot: "Latte" });

    const second = await createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 1 }] }, key());
    expect(second.orderRef).toMatch(/-T007-0002$/);
  });

  it("returns the same order when the same submission is retried, and refuses a reused key for a different cart", async () => {
    const m = await seedMenu();
    const k = key();
    const first = await createOrder(cart(m), k);
    expect(await createOrder(cart(m), k)).toEqual(first);
    const [{ count }] = await sql`select count(*)::int as count from orders where table_id = ${m.tableId}`;
    expect(count).toBe(1);

    const err = await rejection(createOrder(cart(m, { customerNote: "different" }), k));
    expect(err.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("creates exactly one order when the same submission races itself", async () => {
    const m = await seedMenu();
    const k = key();
    const results = await Promise.all(Array.from({ length: 5 }, () => createOrder(cart(m), k)));
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    const [{ count }] = await sql`select count(*)::int as count from orders where table_id = ${m.tableId}`;
    expect(count).toBe(1);
  });

  it("gives 20 concurrent orders on one table distinct numbers in one session", async () => {
    const m = await seedMenu();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 1 }] }, key())),
    );
    const seqs = results.map((r) => Number(r.orderRef.slice(-4))).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const sessions = await sql`select distinct session_id from orders where table_id = ${m.tableId}`;
    expect(sessions).toHaveLength(1);
  });

  it("uses the same permanent QR code across 3 consecutive sessions (ADR-004)", async () => {
    const m = await seedMenu();
    const placed = [];
    for (let i = 0; i < 3; i++) {
      placed.push(await createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 1 }] }, key()));
      // Close the session the way the cashier will (ORD-002 adds the real close flow).
      await sql`update table_sessions set status = 'CLOSED', closed_at = now() where table_id = ${m.tableId} and status <> 'CLOSED'`;
    }
    const rows = await sql`select session_id, order_ref, tracking_token from orders where table_id = ${m.tableId} order by created_at`;
    expect(new Set(rows.map((r) => r.session_id)).size).toBe(3);
    expect(new Set(rows.map((r) => r.order_ref)).size).toBe(3);
    expect(new Set(placed.map((p) => p.trackingToken)).size).toBe(3);
    const [table] = await sql`select qr_token, qr_token_rotated_at from dining_tables where id = ${m.tableId}`;
    expect({ ...table }).toEqual({ qr_token: m.qrToken, qr_token_rotated_at: null });
  });

  it("refuses sold-out, unknown or other-branch products and lists each problem", async () => {
    const m = await seedMenu();
    const other = await seedMenu();
    const err = await rejection(
      createOrder(
        {
          qrToken: m.qrToken,
          items: [
            { productId: m.water, quantity: 1 },
            { productId: m.cake, quantity: 1 },
            { productId: uuidv7(), quantity: 1 },
            { productId: other.water, quantity: 1 },
          ],
        },
        key(),
      ),
    );
    expect(err.code).toBe("ITEMS_UNAVAILABLE");
    expect(err.details.problems).toEqual([
      { itemIndex: 1, kind: "product_sold_out" },
      { itemIndex: 2, kind: "product_unavailable" },
      { itemIndex: 3, kind: "product_unavailable" },
    ]);
    await sql`update menu_categories set is_active = false where id = ${m.categoryId}`;
    expect((await rejection(createOrder(cart(m), key()))).code).toBe("ITEMS_UNAVAILABLE");
  });

  it("enforces option rules on the server", async () => {
    const m = await seedMenu();
    const missing = await rejection(createOrder({ qrToken: m.qrToken, items: [{ productId: m.latte, quantity: 1 }] }, key()));
    expect(missing.code).toBe("INVALID_OPTIONS");
    expect(missing.details.problems).toEqual([{ itemIndex: 0, kind: "too_few", groupId: m.size, min: 1 }]);
    const both = await rejection(createOrder({ qrToken: m.qrToken, items: [{ productId: m.latte, quantity: 1, optionIds: [m.small, m.large] }] }, key()));
    expect(both.details.problems).toEqual([{ itemIndex: 0, kind: "too_many", groupId: m.size, max: 1 }]);
    const foreign = await rejection(createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 1, optionIds: [m.large] }] }, key()));
    expect(foreign.details.problems).toEqual([{ itemIndex: 0, kind: "unknown_option", optionId: m.large }]);
  });

  it("refuses unknown and inactive tables and a session that is closing", async () => {
    const m = await seedMenu();
    expect((await rejection(createOrder(cart(m, { qrToken: qr() }), key()))).code).toBe("TABLE_NOT_FOUND");
    await sql`update dining_tables set is_active = false where id = ${m.tableId}`;
    expect((await rejection(createOrder(cart(m), key()))).code).toBe("TABLE_INACTIVE");
    await sql`update dining_tables set is_active = true where id = ${m.tableId}`;
    await createOrder(cart(m), key());
    await sql`update table_sessions set status = 'CLOSING', closing_started_at = now() where table_id = ${m.tableId}`;
    expect((await rejection(createOrder(cart(m), key()))).code).toBe("SESSION_CLOSING");
  });

  it("asks the customer to confirm when the total changed since they saw it", async () => {
    const m = await seedMenu();
    const quote = await quoteOrder(cart(m));
    expect(quote.totals.totalMinor).toBe(13908);
    await sql`update products set price_minor = 5000 where id = ${m.latte}`;
    const err = await rejection(createOrder(cart(m, { expectedTotalMinor: quote.totals.totalMinor }), key()));
    expect(err.code).toBe("PRICES_CHANGED");
    // 2 × (50.00 + 10.50) + 10.00 = 131.00; VAT 18.34; total 149.34
    expect(err.details.quote?.totals.totalMinor).toBe(14934);
    const order = await createOrder(cart(m, { expectedTotalMinor: 14934 }), key());
    expect(order.totals.totalMinor).toBe(14934);
    const [{ count }] = await sql`select count(*)::int as count from orders where table_id = ${m.tableId}`;
    expect(count).toBe(1);
  });

  it("applies tax-inclusive prices and a service charge from the branch settings", async () => {
    const m = await seedMenu();
    await sql`update branch_settings set prices_include_tax = true, service_charge_bps = 1200 where branch_id = ${m.branchId}`;
    // Water 10.00 incl. 14%: net 8.77, tax 1.23; service 12% of net = 1.05; total 11.05
    const order = await createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 1 }] }, key());
    expect(order.totals).toEqual({ subtotalMinor: 877, discountMinor: 0, taxMinor: 123, serviceMinor: 105, totalMinor: 1105 });
  });

  it("rejects malformed requests before touching the database", async () => {
    const m = await seedMenu();
    await expect(createOrder({ qrToken: m.qrToken, items: [] }, key())).rejects.toThrow();
    await expect(createOrder({ qrToken: m.qrToken, items: [{ productId: m.water, quantity: 0 }] }, key())).rejects.toThrow();
    await expect(createOrder({ qrToken: "../../etc", items: [{ productId: m.water, quantity: 1 }] }, key())).rejects.toThrow();
    await expect(createOrder(cart(m), "short")).rejects.toThrow();
  });
});
