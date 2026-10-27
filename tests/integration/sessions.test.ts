import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AuthError, type Role, type StaffUser } from "@/server/auth/permissions";
import { createOrder, OrderError } from "@/server/orders/create";
import { cancelClosing, closeSession, getTablesOverview, SessionError, startClosing, tableColor } from "@/server/sessions/service";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

const key = () => randomBytes(16).toString("base64url");

async function seed() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const tableId = uuidv7();
  const emptyTableId = uuidv7();
  const qrToken = randomBytes(24).toString("base64url");
  const categoryId = uuidv7();
  const productId = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency)
            values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into branch_settings (branch_id) values (${branchId})`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values
            (${tableId}, ${branchId}, 3, ${qrToken}), (${emptyTableId}, ${branchId}, 4, ${randomBytes(24).toString("base64url")})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'م', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branchId}, ${categoryId}, 'مياه', 'Water', 1000)`;
  const staff = async (role: Role): Promise<StaffUser> => {
    const userId = uuidv7();
    await sql`insert into users (id, name, email) values (${userId}, 'Staff', ${`s-${userId}@example.com`})`;
    await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
    return { id: userId, name: "Staff", email: "s@example.com", roles: [{ branchId, role }] };
  };
  const order = () => createOrder({ qrToken, items: [{ productId, quantity: 1 }] }, key());
  const session = async () => {
    const [s] = await sql`select id, status, version from table_sessions where table_id = ${tableId} and status <> 'CLOSED'`;
    return s as { id: string; status: string; version: number } | undefined;
  };
  return { branchId, tableId, emptyTableId, qrToken, staff, order, session };
}

const settle = (orderId: string) => sql`update orders set payment_status = 'PAID', paid_minor = total_minor, delivery_status = 'DELIVERED', kitchen_status = 'READY' where id = ${orderId}`;

describe("table session lifecycle (ORD-002, ADR-008 §4)", () => {
  it("blocks new customer orders while closing and allows them again after cancelling", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    await s.order();
    let current = (await s.session())!;
    const closing = await startClosing(cashier, current.id, current.version);
    expect(closing.status).toBe("CLOSING");
    await expect(s.order()).rejects.toThrow(OrderError);

    current = (await s.session())!;
    expect((await cancelClosing(cashier, current.id, current.version)).status).toBe("OPEN");
    await s.order();
    const actions = await sql`select action from audit_logs where entity_id = ${current.id} order by created_at, id`;
    expect(actions.map((a) => a.action)).toEqual(["SESSION_CLOSING_STARTED", "SESSION_CLOSING_CANCELLED"]);
  });

  it("refuses to close while orders are unpaid or undelivered, and says which ones", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const first = await s.order();
    const second = await s.order();
    const cancelled = await s.order();
    await sql`update orders set kitchen_status = 'CANCELLED', cancel_reason = 'Customer left' where id = ${cancelled.orderId}`;
    await sql`update orders set payment_status = 'PAID', paid_minor = total_minor where id = ${second.orderId}`;
    const current = (await s.session())!;

    const err = await closeSession(cashier, current.id, current.version).catch((e: SessionError) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).code).toBe("UNSETTLED_ORDERS");
    expect((err as SessionError).blockingOrders).toEqual([
      { orderId: first.orderId, orderRef: first.orderRef, reasons: ["unpaid", "not_delivered"] },
      { orderId: second.orderId, orderRef: second.orderRef, reasons: ["not_delivered"] },
    ]);

    // Under the ALL_PAID policy, delivery does not matter.
    await sql`update branch_settings set session_close_policy = 'ALL_PAID' where branch_id = ${s.branchId}`;
    await sql`update orders set payment_status = 'PAID', paid_minor = total_minor where id = ${first.orderId}`;
    const closed = await closeSession(cashier, current.id, current.version);
    expect(closed).toMatchObject({ status: "CLOSED", closedBy: cashier.id });
  });

  it("closes a settled table, clears its assistance requests and frees it for the next guests", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const placed = await s.order();
    await settle(placed.orderId);
    const current = (await s.session())!;
    await sql`insert into assistance_requests (id, branch_id, table_id, session_id) values (${uuidv7()}, ${s.branchId}, ${s.tableId}, ${current.id})`;

    await closeSession(admin, current.id, current.version);
    expect(await s.session()).toBeUndefined();
    const requests = await sql`select status from assistance_requests where table_id = ${s.tableId}`;
    expect(requests.map((r) => r.status)).toEqual(["CANCELLED"]);

    // Same QR code, new session, new number.
    const next = await s.order();
    expect((await s.session())!.id).not.toBe(current.id);
    expect(next.orderRef).toMatch(/-T003-0002$/);
    const [table] = await sql`select qr_token from dining_tables where id = ${s.tableId}`;
    expect(table.qr_token).toBe(s.qrToken);
  });

  it("lets only one of two cashiers act on the same version", async () => {
    const s = await seed();
    const a = await s.staff("CASHIER");
    const b = await s.staff("CASHIER");
    const placed = await s.order();
    await settle(placed.orderId);
    const current = (await s.session())!;

    const results = await Promise.allSettled([closeSession(a, current.id, current.version), closeSession(b, current.id, current.version)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as SessionError).code).toBe("CONFLICT");
  });

  it("is limited to cashiers and admins of the same branch", async () => {
    const s = await seed();
    const other = await seed();
    const kitchen = await s.staff("KITCHEN");
    const foreignCashier = await other.staff("CASHIER");
    await s.order();
    const current = (await s.session())!;
    await expect(startClosing(kitchen, current.id, current.version)).rejects.toThrow(AuthError);
    await expect(startClosing(foreignCashier, current.id, current.version)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows each table's derived status on the cashier overview", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const placed = await s.order();
    await sql`insert into assistance_requests (id, branch_id, table_id) values (${uuidv7()}, ${s.branchId}, ${s.tableId})`;

    const overview = await getTablesOverview(cashier);
    expect(overview.map((t) => [t.number, t.color, t.awaitingPayment, t.assistancePending, t.orderCount])).toEqual([
      [3, "new_order", true, true, 1],
      [4, "available", false, false, 0],
    ]);
    await sql`update orders set kitchen_status = 'READY' where id = ${placed.orderId}`;
    expect((await getTablesOverview(cashier))[0].color).toBe("ready");
    const kitchen = await s.staff("KITCHEN");
    await expect(getTablesOverview(kitchen)).rejects.toThrow(AuthError);
  });
});

describe("tableColor (ADR-008 §6)", () => {
  const o = (kitchenStatus: string, deliveryStatus = "NOT_ASSIGNED", paymentStatus = "UNPAID") => ({ kitchenStatus, deliveryStatus, paymentStatus });
  it("applies the first matching rule", () => {
    expect(tableColor(false, [])).toBe("available");
    expect(tableColor(true, [o("READY"), o("NEW")])).toBe("new_order");
    expect(tableColor(true, [o("IN_PREPARATION"), o("READY")])).toBe("ready");
    expect(tableColor(true, [o("ACCEPTED"), o("READY", "DELIVERED")])).toBe("in_preparation");
    expect(tableColor(true, [o("READY", "DELIVERED"), o("CANCELLED")])).toBe("seated");
    expect(tableColor(true, [])).toBe("seated");
  });
});

describe("orders racing a session close", () => {
  it("never puts an order into a session that is being closed", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    const placed = await s.order();
    await settle(placed.orderId);
    const current = (await s.session())!;
    const [closed, ordered] = await Promise.allSettled([closeSession(cashier, current.id, current.version), s.order()]);
    const sessions = await sql`select id, status from table_sessions where table_id = ${s.tableId} order by created_at`;
    const unpaidInClosed = await sql`select o.id from orders o join table_sessions t on t.id = o.session_id
                                     where t.status = 'CLOSED' and o.payment_status = 'UNPAID' and o.table_id = ${s.tableId}`;
    // Either the close won and the order opened a new session, or the order won and blocked the close.
    expect(unpaidInClosed).toHaveLength(0);
    expect(closed.status === "fulfilled" || ordered.status === "fulfilled").toBe(true);
    if (closed.status === "fulfilled") expect(sessions.map((x) => x.status)).toEqual(["CLOSED", "OPEN"]);
  });
});
