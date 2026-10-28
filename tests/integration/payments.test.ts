import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AuthError, type Role, type StaffUser } from "@/server/auth/permissions";
import { cancelOrder } from "@/server/operations/orders";
import { createOrder } from "@/server/orders/create";
import { recordPayment, recordRefund, recordSessionPayment } from "@/server/payments/service";
import { closeSession } from "@/server/sessions/service";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function seed() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const qrToken = randomBytes(24).toString("base64url");
  const categoryId = uuidv7();
  const productId = uuidv7();
  const cash = uuidv7();
  const card = uuidv7();
  const retired = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency) values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into branch_settings (branch_id, session_close_policy) values (${branchId}, 'ALL_PAID')`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branchId}, 2, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'م', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branchId}, ${categoryId}, 'قهوة', 'Coffee', 2550)`;
  await sql`insert into payment_methods (id, branch_id, code, name_ar, name_en, is_active) values
            (${cash}, ${branchId}, 'CASH', 'نقدي', 'Cash', true), (${card}, ${branchId}, 'CARD', 'بطاقة', 'Card', true), (${retired}, ${branchId}, 'OLD', 'قديم', 'Old', false)`;
  const staff = async (role: Role): Promise<StaffUser> => {
    const userId = uuidv7();
    await sql`insert into users (id, name, email) values (${userId}, 'Staff', ${`p-${userId}@example.com`})`;
    await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
    return { id: userId, name: "Staff", email: "s@example.com", roles: [{ branchId, role }] };
  };
  const order = () => createOrder({ qrToken, items: [{ productId, quantity: 2 }] }, randomBytes(16).toString("base64url"));
  return { branchId, cash, card, retired, staff, order };
}

describe("manual payments (PAY-001)", () => {
  it("records the full outstanding amount once, with method, reference and audit", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const { orderId, totals } = await s.order();
    expect(totals.totalMinor).toBe(5100);
    await expect(recordPayment(cashier, orderId, 1, s.cash, 5000)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(recordPayment(cashier, orderId, 1, s.retired, 5100)).rejects.toMatchObject({ code: "INVALID" });
    const paid = await recordPayment(cashier, orderId, 1, s.card, 5100, " POS-778 ");
    expect(paid).toMatchObject({ paymentStatus: "PAID", paidMinor: 5100, version: 2 });
    await expect(recordPayment(cashier, orderId, 2, s.cash, 0)).rejects.toMatchObject({ code: "WRONG_STATUS" });

    const [row] = await sql`select kind, amount_minor::int as amount, currency, reference, recorded_by from payments where order_id = ${orderId}`;
    expect(row).toEqual({ kind: "PAYMENT", amount: 5100, currency: "EGP", reference: "POS-778", recorded_by: cashier.id });
    const [audit] = await sql`select action from audit_logs where entity_id = ${orderId}`;
    expect(audit.action).toBe("PAYMENT_RECORDED");
  });

  it("pays a whole table in one go and lets it close", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const a = await s.order();
    const b = await s.order();
    const cancelled = await s.order();
    await cancelOrder(cashier, cancelled.orderId, 1, "Duplicate");
    const [{ session_id: sessionId }] = await sql`select session_id from orders where id = ${a.orderId}`;
    await expect(recordSessionPayment(cashier, sessionId, s.cash, 5100)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await recordSessionPayment(cashier, sessionId, s.cash, 10200)).toEqual({ orders: 2, totalMinor: 10200 });
    const statuses = await sql`select payment_status from orders where id in (${a.orderId}, ${b.orderId}, ${cancelled.orderId}) order by created_at`;
    expect(statuses.map((r) => r.payment_status)).toEqual(["PAID", "PAID", "UNPAID"]);
    const [session] = await sql`select version from table_sessions where id = ${sessionId}`;
    expect(await closeSession(cashier, sessionId, session.version)).toMatchObject({ status: "CLOSED" });
  });

  it("never lets two cashiers pay the same order twice", async () => {
    const s = await seed();
    const [x, y] = [await s.staff("CASHIER"), await s.staff("CASHIER")];
    const { orderId } = await s.order();
    const results = await Promise.allSettled([recordPayment(x, orderId, 1, s.cash, 5100), recordPayment(y, orderId, 1, s.cash, 5100)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ count }] = await sql`select count(*)::int as count from payments where order_id = ${orderId}`;
    expect(count).toBe(1);
  });

  it("refunds are admin-only, need a reason and cannot exceed what was paid", async () => {
    const s = await seed();
    const [cashier, admin] = [await s.staff("CASHIER"), await s.staff("ADMIN")];
    const { orderId } = await s.order();
    await expect(recordPayment(cashier, orderId, 1, s.card, 5100)).resolves.toBeTruthy();
    await expect(recordRefund(cashier, orderId, 2, null, 100, "Cold coffee")).rejects.toThrow(AuthError);
    await expect(recordRefund(admin, orderId, 2, null, 100, "")).rejects.toMatchObject({ code: "INVALID" });
    await expect(recordRefund(admin, orderId, 2, null, 9999, "Too much")).rejects.toMatchObject({ code: "INVALID" });
    expect(await recordRefund(admin, orderId, 2, null, 2550, "Cold coffee")).toMatchObject({ paymentStatus: "PARTIALLY_REFUNDED", paidMinor: 2550 });
    expect(await recordRefund(admin, orderId, 3, null, 2550, "Second cup cold")).toMatchObject({ paymentStatus: "REFUNDED", paidMinor: 0 });
    const refunds = await sql`select method_id, reason from payments where order_id = ${orderId} and kind = 'REFUND'`;
    expect(refunds.every((r) => r.method_id === s.card)).toBe(true);
    // Fully refunded, so it can now be cancelled.
    await expect(cancelOrder(admin, orderId, 4, "Customer left")).resolves.toMatchObject({ kitchenStatus: "CANCELLED" });
  });

  it("refuses payments on cancelled orders", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const { orderId } = await s.order();
    await cancelOrder(cashier, orderId, 1, "Mistake");
    await expect(recordPayment(cashier, orderId, 2, s.cash, 5100)).rejects.toMatchObject({ code: "WRONG_STATUS" });
    await expect(recordPayment(await s.staff("KITCHEN"), orderId, 2, s.cash, 5100)).rejects.toThrow(AuthError);
  });
});
