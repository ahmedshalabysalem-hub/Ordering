import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AuthError, type Role, type StaffUser } from "@/server/auth/permissions";
import { requestAssistance } from "@/server/customer/assistance";
import { handleAssistance } from "@/server/operations/assistance";
import { getCashierBoard, getKitchenBoard } from "@/server/operations/boards";
import { createCaptain, updateCaptain } from "@/server/operations/captains";
import { assignCaptain, cancelOrder, markDelivered, moveKitchenStatus, OperationError } from "@/server/operations/orders";
import { createOrder } from "@/server/orders/create";
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
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${tableId}, ${branchId}, 4, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'م', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values (${productId}, ${branchId}, ${categoryId}, 'شاي', 'Tea', 1500)`;
  const staff = async (role: Role): Promise<StaffUser> => {
    const userId = uuidv7();
    await sql`insert into users (id, name, email) values (${userId}, 'Staff', ${`o-${userId}@example.com`})`;
    await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
    return { id: userId, name: "Staff", email: "s@example.com", roles: [{ branchId, role }] };
  };
  const order = async () => {
    const placed = await createOrder({ qrToken, items: [{ productId, quantity: 2, note: "No sugar" }] }, randomBytes(16).toString("base64url"));
    return placed.orderId;
  };
  const version = async (orderId: string) => (await sql`select version from orders where id = ${orderId}`)[0].version as number;
  return { branchId, tableId, qrToken, staff, order, version };
}

describe("kitchen moves (OPS-002, ADR-008 §1)", () => {
  it("follows NEW → ACCEPTED → IN_PREPARATION → READY with version checks", async () => {
    const s = await seed();
    const kitchen = await s.staff("KITCHEN");
    const id = await s.order();
    await moveKitchenStatus(kitchen, id, 1, "ACCEPTED");
    await expect(moveKitchenStatus(kitchen, id, 1, "IN_PREPARATION")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(moveKitchenStatus(kitchen, id, 2, "READY")).rejects.toMatchObject({ code: "WRONG_STATUS" });
    await moveKitchenStatus(kitchen, id, 2, "IN_PREPARATION");
    const ready = await moveKitchenStatus(kitchen, id, 3, "READY");
    expect(ready).toMatchObject({ kitchenStatus: "READY", version: 4 });
    const events = await sql`select from_status, to_status from order_events where order_id = ${id} and type = 'KITCHEN_STATUS' order by created_at, id`;
    expect(events.map((e) => `${e.from_status}>${e.to_status}`)).toEqual(["NEW>ACCEPTED", "ACCEPTED>IN_PREPARATION", "IN_PREPARATION>READY"]);
  });

  it("lets only one of two cooks move the same ticket, and keeps cashiers out", async () => {
    const s = await seed();
    const [a, b, cashier] = [await s.staff("KITCHEN"), await s.staff("KITCHEN"), await s.staff("CASHIER")];
    const id = await s.order();
    const results = await Promise.allSettled([moveKitchenStatus(a, id, 1, "IN_PREPARATION"), moveKitchenStatus(b, id, 1, "IN_PREPARATION")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(moveKitchenStatus(cashier, id, 2, "READY")).rejects.toThrow(AuthError);
  });
});

describe("cancelling (ADR-008 §1)", () => {
  it("lets a cashier cancel before preparation, but only an admin afterwards, always with a reason", async () => {
    const s = await seed();
    const [cashier, admin, kitchen] = [await s.staff("CASHIER"), await s.staff("ADMIN"), await s.staff("KITCHEN")];
    const early = await s.order();
    await expect(cancelOrder(cashier, early, 1, " ")).rejects.toMatchObject({ code: "INVALID" });
    expect(await cancelOrder(cashier, early, 1, "Customer left")).toMatchObject({ kitchenStatus: "CANCELLED", cancelReason: "Customer left" });

    const late = await s.order();
    await moveKitchenStatus(kitchen, late, 1, "IN_PREPARATION");
    await expect(cancelOrder(cashier, late, 2, "Too slow")).rejects.toThrow(AuthError);
    await cancelOrder(admin, late, 2, "Wrong table");
    const audits = await sql`select action, reason from audit_logs where entity_id in (${early}, ${late}) order by created_at, id`;
    expect(audits.map((a) => [a.action, a.reason])).toEqual([
      ["ORDER_CANCELLED", "Customer left"],
      ["ORDER_CANCELLED", "Wrong table"],
    ]);
  });

  it("refuses to cancel an order that has money recorded", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const id = await s.order();
    await sql`update orders set paid_minor = total_minor, payment_status = 'PAID' where id = ${id}`;
    await expect(cancelOrder(admin, id, 1, "Changed mind")).rejects.toMatchObject({ code: "WRONG_STATUS" });
  });
});

describe("captains and serving (OPS-003, ADR-008 §2, ADR-015)", () => {
  it("assigns, reassigns and unassigns with history, and only active captains", async () => {
    const s = await seed();
    const [admin, cashier] = [await s.staff("ADMIN"), await s.staff("CASHIER")];
    const sara = await createCaptain(admin, { name: "Sara" });
    const omar = await createCaptain(admin, { name: "Omar", phone: "0100" });
    const id = await s.order();
    await assignCaptain(cashier, id, 1, sara.id);
    await assignCaptain(cashier, id, 2, omar.id);
    const rows = await sql`select captain_id, unassigned_at from captain_assignments where order_id = ${id} order by created_at, id`;
    expect(rows.map((r) => [r.captain_id, r.unassigned_at === null])).toEqual([
      [sara.id, false],
      [omar.id, true],
    ]);
    await updateCaptain(admin, sara.id, { name: "Sara", isActive: false });
    await expect(assignCaptain(cashier, id, 3, sara.id)).rejects.toMatchObject({ code: "INVALID" });
    expect(await assignCaptain(cashier, id, 3, null)).toMatchObject({ deliveryStatus: "NOT_ASSIGNED" });
    await expect(createCaptain(cashier, { name: "X" })).rejects.toThrow(AuthError);
  });

  it("serves only ready orders, with or without a captain", async () => {
    const s = await seed();
    const [cashier, kitchen] = [await s.staff("CASHIER"), await s.staff("KITCHEN")];
    const id = await s.order();
    await expect(markDelivered(cashier, id, 1)).rejects.toMatchObject({ code: "WRONG_STATUS" });
    await moveKitchenStatus(kitchen, id, 1, "IN_PREPARATION");
    await moveKitchenStatus(kitchen, id, 2, "READY");
    expect(await markDelivered(cashier, id, 3)).toMatchObject({ deliveryStatus: "DELIVERED" });
    await expect(markDelivered(cashier, id, 4)).rejects.toMatchObject({ code: "WRONG_STATUS" });
  });
});

describe("assistance handling (OPS-004, ADR-008 §5)", () => {
  it("acknowledges and resolves once, and frees the table for a new request", async () => {
    const s = await seed();
    const [a, b] = [await s.staff("CASHIER"), await s.staff("CASHIER")];
    await requestAssistance(s.qrToken);
    const [{ id }] = await sql`select id from assistance_requests where table_id = ${s.tableId}`;
    const results = await Promise.allSettled([handleAssistance(a, id, "acknowledge"), handleAssistance(b, id, "acknowledge")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(handleAssistance(a, id, "cancel")).rejects.toThrow(OperationError);
    expect(await handleAssistance(b, id, "resolve")).toMatchObject({ status: "RESOLVED", resolvedBy: b.id });
    await expect(handleAssistance(await s.staff("KITCHEN"), id, "resolve")).rejects.toThrow(AuthError);
  });
});

describe("boards (OPS-001, OPS-002)", () => {
  it("shows the cashier the table's orders and requests, and the kitchen its tickets", async () => {
    const s = await seed();
    const [cashier, kitchen] = [await s.staff("CASHIER"), await s.staff("KITCHEN")];
    const id = await s.order();
    await requestAssistance(s.qrToken);
    const board = await getCashierBoard(cashier);
    expect(board.currency).toBe("EGP");
    expect(board.tables[0]).toMatchObject({ number: 4, color: "new_order" });
    expect(board.tables[0].orders.map((o) => [o.id, o.items[0].name, o.items[0].note])).toEqual([[id, "Tea", "No sugar"]]);
    expect(board.assistance.map((a) => [a.tableNumber, a.status])).toEqual([[4, "PENDING"]]);

    const tickets = await getKitchenBoard(kitchen);
    expect(tickets.tickets.map((t) => [t.tableNumber, t.kitchenStatus, t.items[0].quantity])).toEqual([[4, "NEW", 2]]);
    expect(tickets.products.map((p) => p.name)).toEqual(["Tea"]);
    await expect(getCashierBoard(kitchen)).rejects.toThrow(AuthError);
    await expect(getKitchenBoard(cashier)).rejects.toThrow(AuthError);
  });
});
