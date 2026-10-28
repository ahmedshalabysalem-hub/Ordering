import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AssistanceError, requestAssistance } from "@/server/customer/assistance";
import { getPublicMenu } from "@/server/customer/menu";
import { getTrackedOrder } from "@/server/customer/tracking";
import { createOrder } from "@/server/orders/create";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

const qr = () => randomBytes(24).toString("base64url");
const key = () => randomBytes(16).toString("base64url");

async function seed() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const tableId = uuidv7();
  const qrToken = qr();
  const drinks = uuidv7();
  const hidden = uuidv7();
  const latte = uuidv7();
  const cake = uuidv7();
  const retired = uuidv7();
  const size = uuidv7();
  const oldGroup = uuidv7();
  const small = uuidv7();
  const large = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency, default_language)
            values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP', 'en')`;
  await sql`insert into branch_settings (branch_id, assistance_cooldown_seconds) values (${branchId}, 60)`;
  await sql`insert into tax_rates (id, branch_id, name, rate_bps) values (${uuidv7()}, ${branchId}, 'VAT', 1400)`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${tableId}, ${branchId}, 5, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en, sort_order, is_active) values
            (${drinks}, ${branchId}, 'مشروبات', 'Drinks', 1, true), (${hidden}, ${branchId}, 'قديم', 'Old', 0, false)`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, description_en, price_minor, is_available, is_active, sort_order, sku) values
            (${latte}, ${branchId}, ${drinks}, 'لاتيه', 'Latte', 'Espresso and milk', 4550, true, true, 1, 'LAT-1'),
            (${cake}, ${branchId}, ${drinks}, 'كيك', 'Cake', null, 3000, false, true, 2, null),
            (${retired}, ${branchId}, ${drinks}, 'قديم', 'Retired', null, 100, true, false, 0, null),
            (${uuidv7()}, ${branchId}, ${hidden}, 'مخفي', 'Hidden', null, 100, true, true, 0, null)`;
  await sql`insert into modifier_groups (id, branch_id, name_ar, name_en, min_select, max_select, is_active) values
            (${size}, ${branchId}, 'الحجم', 'Size', 1, 1, true), (${oldGroup}, ${branchId}, 'قديم', 'Old', 0, 1, false)`;
  await sql`insert into modifier_options (id, group_id, name_ar, name_en, price_delta_minor, sort_order, is_available) values
            (${small}, ${size}, 'صغير', 'Small', 0, 1, true), (${large}, ${size}, 'كبير', 'Large', 1050, 2, false)`;
  await sql`insert into product_modifier_groups (product_id, group_id) values (${latte}, ${size}), (${latte}, ${oldGroup})`;
  return { branchId, tableId, qrToken, latte, cake, small, large };
}

describe("public menu (UI-001)", () => {
  it("lists active categories and products with active option groups, and nothing internal", async () => {
    const s = await seed();
    const menu = await getPublicMenu(s.branchId);
    expect(menu).toMatchObject({ currency: "EGP", defaultLanguage: "en", hasTax: true, pricesIncludeTax: false, serviceChargeBps: 0 });
    expect(menu.restaurant).toEqual({ nameAr: "كافيه", nameEn: "Cafe", logoUrl: null });
    expect(menu.categories.map((c) => c.nameEn)).toEqual(["Drinks"]);
    const [latte, cake] = menu.categories[0].products;
    expect(menu.categories[0].products).toHaveLength(2);
    expect(latte).toMatchObject({ nameEn: "Latte", priceMinor: 4550, isAvailable: true, descriptionEn: "Espresso and milk" });
    expect(cake).toMatchObject({ nameEn: "Cake", isAvailable: false });
    expect(latte.groups.map((g) => g.nameEn)).toEqual(["Size"]);
    expect(latte.groups[0].options.map((o) => [o.nameEn, o.isAvailable])).toEqual([
      ["Small", true],
      ["Large", false],
    ]);
    expect(JSON.stringify(menu)).not.toContain("LAT-1");
  });
});

describe("order tracking (UI-005)", () => {
  it("returns the receipt only for the exact tracking token", async () => {
    const s = await seed();
    const order = await createOrder({ qrToken: s.qrToken, items: [{ productId: s.latte, quantity: 2, optionIds: [s.small], note: "Hot" }], customerNote: "Window" }, key());
    const tracked = await getTrackedOrder(order.trackingToken);
    expect(tracked).toMatchObject({
      orderRef: order.orderRef,
      tableNumber: 5,
      timezone: "Africa/Cairo",
      kitchenStatus: "NEW",
      paymentStatus: "UNPAID",
      subtotalMinor: 9100,
      taxMinor: 1274,
      totalMinor: 10374,
      customerNote: "Window",
    });
    expect(tracked!.items).toEqual([
      {
        nameAr: "لاتيه",
        nameEn: "Latte",
        quantity: 2,
        unitPriceMinor: 4550,
        lineTotalMinor: 9100,
        note: "Hot",
        options: [{ groupNameAr: "الحجم", groupNameEn: "Size", nameAr: "صغير", nameEn: "Small", priceDeltaMinor: 0 }],
      },
    ]);

    // Menu changes later do not alter the receipt.
    await sql`update products set name_en = 'Renamed', price_minor = 1 where id = ${s.latte}`;
    expect((await getTrackedOrder(order.trackingToken))!.items[0]).toMatchObject({ nameEn: "Latte", unitPriceMinor: 4550 });

    expect(await getTrackedOrder(order.orderRef)).toBeNull();
    expect(await getTrackedOrder(s.qrToken)).toBeNull();
    expect(await getTrackedOrder(`${order.trackingToken.slice(0, -1)}${order.trackingToken.endsWith("A") ? "B" : "A"}`)).toBeNull();
  });
});

describe("assistance requests (UI-005, SPEC §6.6)", () => {
  it("creates one pending request, deduplicates repeats and links the open session", async () => {
    const s = await seed();
    await createOrder({ qrToken: s.qrToken, items: [{ productId: s.latte, quantity: 1, optionIds: [s.small] }] }, key());
    const [first, second] = await Promise.all([requestAssistance(s.qrToken), requestAssistance(s.qrToken)]);
    expect([first.deduplicated, second.deduplicated].sort()).toEqual([false, true]);
    const rows = await sql`select status, session_id from assistance_requests where table_id = ${s.tableId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].session_id).not.toBeNull();
  });

  it("applies the cooldown after staff handled the last request", async () => {
    const s = await seed();
    const t0 = new Date();
    await requestAssistance(s.qrToken, t0);
    await sql`update assistance_requests set status = 'RESOLVED' where table_id = ${s.tableId}`;
    const err = await requestAssistance(s.qrToken, new Date(t0.getTime() + 20_000)).catch((e: AssistanceError) => e);
    expect(err).toBeInstanceOf(AssistanceError);
    expect((err as AssistanceError).code).toBe("ASSISTANCE_COOLDOWN");
    expect((err as AssistanceError).retryAfterSeconds).toBe(40);
    const later = await requestAssistance(s.qrToken, new Date(t0.getTime() + 61_000));
    expect(later.deduplicated).toBe(false);
  });

  it("refuses unknown and inactive tables", async () => {
    const s = await seed();
    await expect(requestAssistance(qr())).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    await expect(requestAssistance("../etc")).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    await sql`update dining_tables set is_active = false where id = ${s.tableId}`;
    await expect(requestAssistance(s.qrToken)).rejects.toMatchObject({ code: "TABLE_INACTIVE" });
  });
});
