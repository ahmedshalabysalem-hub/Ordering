import { randomBytes } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { getOrderDetail, listAudit, listOrderHistory } from "@/server/admin/history";
import { csvCell, getReport, reportCsv, resolveRange } from "@/server/admin/reports";
import { addPaymentMethod, getSettings, percentToBps, bpsToPercent, updateSettings } from "@/server/admin/settings";
import { createSupplier, listSuppliers, updateSupplier } from "@/server/admin/suppliers";
import { createUser, listUsers, resetPassword, updateUser } from "@/server/admin/users";
import type { Role, StaffUser } from "@/server/auth/permissions";
import { cancelOrder, moveKitchenStatus } from "@/server/operations/orders";
import { createOrder } from "@/server/orders/create";
import { recordPayment, recordRefund } from "@/server/payments/service";
import { minorToDecimal } from "@/server/money";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function seed() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const qrToken = randomBytes(24).toString("base64url");
  const categoryId = uuidv7();
  const coffee = uuidv7();
  const tea = uuidv7();
  const cash = uuidv7();
  const card = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency) values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into branch_settings (branch_id) values (${branchId})`;
  await sql`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branchId}, 4, ${qrToken})`;
  await sql`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${branchId}, 'م', 'Drinks')`;
  await sql`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor) values
            (${coffee}, ${branchId}, ${categoryId}, 'قهوة', 'Coffee', 2550), (${tea}, ${branchId}, ${categoryId}, 'شاي', 'Tea', 1000)`;
  await sql`insert into payment_methods (id, branch_id, code, name_ar, name_en) values (${cash}, ${branchId}, 'CASH', 'نقدي', 'Cash'), (${card}, ${branchId}, 'CARD', 'بطاقة', 'Card')`;
  const staff = async (role: Role): Promise<StaffUser> => {
    const userId = uuidv7();
    await sql`insert into users (id, name, email) values (${userId}, ${`${role} user`}, ${`a-${userId}@example.com`})`;
    await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
    return { id: userId, name: `${role} user`, email: "s@example.com", roles: [{ branchId, role }] };
  };
  const order = (items: { productId: string; quantity: number }[]) => createOrder({ qrToken, items }, randomBytes(16).toString("base64url"));
  return { branchId, coffee, tea, cash, card, staff, order };
}

describe("reports (ADM-005)", () => {
  it("separates order value, payments, refunds and outstanding and ignores cancelled orders", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const cashier = await s.staff("CASHIER");
    const kitchen = await s.staff("KITCHEN");
    const paid = await s.order([{ productId: s.coffee, quantity: 2 }]); // 5100
    const unpaid = await s.order([{ productId: s.tea, quantity: 3 }]); // 3000
    const cancelled = await s.order([{ productId: s.tea, quantity: 1 }]);
    const refunded = await s.order([{ productId: s.tea, quantity: 1 }]); // 1000
    await recordPayment(cashier, paid.orderId, 1, s.card, 5100);
    await cancelOrder(cashier, cancelled.orderId, 1, "Customer left");
    await recordPayment(cashier, refunded.orderId, 1, s.cash, 1000);
    await recordRefund(admin, refunded.orderId, 2, s.cash, 400, "Cold tea");
    await moveKitchenStatus(kitchen, unpaid.orderId, 1, "ACCEPTED");
    await moveKitchenStatus(kitchen, unpaid.orderId, 2, "IN_PREPARATION");
    await moveKitchenStatus(kitchen, unpaid.orderId, 3, "READY");

    const r = await getReport(admin, {});
    expect(r.totals).toMatchObject({
      orders: 4,
      cancelled: 1,
      grossMinor: 9100,
      totalMinor: 9100,
      paymentsMinor: 6100,
      refundsMinor: 400,
      netMinor: 5700,
      outstandingMinor: 3400,
    });
    expect(r.daily).toHaveLength(1);
    expect(r.byPaymentMethod).toEqual([
      { method: "Card", paymentsMinor: 5100, refundsMinor: 0, netMinor: 5100, count: 1 },
      { method: "Cash", paymentsMinor: 1000, refundsMinor: 400, netMinor: 600, count: 1 },
    ]);
    expect(r.topProducts[0]).toEqual({ name: "Tea", quantity: 4, revenueMinor: 4000 });
    expect(r.categories).toEqual([{ name: "Drinks", quantity: 6, revenueMinor: 9100 }]);
    expect(r.byTable).toEqual([{ tableNumber: 4, orders: 3, totalMinor: 9100 }]);
    expect(r.timing.prepOrders).toBe(1);
    expect(r.cancelled).toMatchObject([{ reason: "Customer left", totalMinor: 1000 }]);

    const csv = reportCsv(r, "daily", (m) => minorToDecimal(m, "EGP"));
    expect(csv.split("\r\n")[1]).toMatch(/,4,1,91\.00,0\.00,0\.00,0\.00,91\.00,61\.00,4\.00,57\.00,34\.00$/);

    // Cashiers get operational reports for the last 7 days only; kitchen gets none.
    expect((await getReport(cashier, {})).totals.orders).toBe(4);
    await expect(getReport(kitchen, {})).rejects.toMatchObject({ status: 403 });
  });

  it("only counts the requested business days", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const old = await s.order([{ productId: s.tea, quantity: 1 }]);
    await sql`update orders set business_date = business_date - 30 where id = ${old.orderId}`;
    await s.order([{ productId: s.coffee, quantity: 1 }]);
    const today = (await getReport(admin, {})).range.to;
    expect((await getReport(admin, {})).totals.orders).toBe(1);
    const month = await getReport(admin, { from: "2000-01-01", to: today });
    expect(month.totals.orders).toBe(2);
    expect(month.clamped).toBe(true); // more than a year was asked for
    const cashier = await s.staff("CASHIER");
    const recent = await getReport(cashier, { from: "2000-01-01", to: today });
    expect(recent.totals.orders).toBe(1);
  });

  it("clamps ranges and neutralises CSV formulas", () => {
    expect(resolveRange({ from: "2026-10-20", to: "2026-10-10" }, "2026-10-28", true)).toEqual({ from: "2026-10-10", to: "2026-10-20", clamped: false });
    expect(resolveRange({ from: "2026-01-01" }, "2026-10-28", false)).toEqual({ from: "2026-10-22", to: "2026-10-28", clamped: true });
    expect(resolveRange({ from: "nonsense", to: "2026-02-30" }, "2026-10-28", true)).toEqual({ from: "2026-10-28", to: "2026-10-28", clamped: false });
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell('Say "hi", ok')).toBe(`"Say ""hi"", ok"`);
  });
});

describe("users (ADM-001)", () => {
  it("creates a user who can sign in, and resets the password", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const email = `new-${uuidv7()}@example.com`;
    const { id } = await createUser(admin, { name: "Mona", email: email.toUpperCase(), role: "CASHIER", password: "first-pass-123" });
    const [account] = await sql`select password from auth_accounts where user_id = ${id} and provider_id = 'credential'`;
    expect(await verifyPassword({ hash: account.password, password: "first-pass-123" })).toBe(true);
    await expect(createUser(admin, { name: "Again", email, role: "KITCHEN", password: "first-pass-123" })).rejects.toThrow(/already exists/);
    expect((await listUsers(admin)).find((u) => u.id === id)).toMatchObject({ email, role: "CASHIER", isActive: true });

    await sql`update users set locked_until = now() + interval '1 hour', failed_login_count = 9 where id = ${id}`;
    await resetPassword(admin, id, "second-pass-456");
    const [after] = await sql`select u.locked_until, u.failed_login_count, a.password from users u join auth_accounts a on a.user_id = u.id where u.id = ${id}`;
    expect(after.locked_until).toBeNull();
    expect(after.failed_login_count).toBe(0);
    expect(await verifyPassword({ hash: after.password, password: "second-pass-456" })).toBe(true);
    const audits = await sql`select action, after from audit_logs where entity_id = ${id} order by created_at`;
    expect(audits.map((a) => a.action)).toEqual(["USER_CREATED", "USER_PASSWORD_RESET"]);
    expect(JSON.stringify(audits)).not.toContain("pass-");
  });

  it("keeps at least one active admin and revokes sessions on deactivation", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    await expect(updateUser(admin, admin.id, { name: "Me", role: "CASHIER", isActive: true })).rejects.toThrow(/own admin/);
    const { id: other } = await createUser(admin, { name: "Second", email: `second-${uuidv7()}@example.com`, role: "ADMIN", password: "second-admin-1" });
    const otherStaff: StaffUser = { id: other, name: "Second", email: "x", roles: [{ branchId: s.branchId, role: "ADMIN" }] };
    await sql`insert into auth_sessions (id, user_id, token, expires_at) values (${uuidv7()}, ${other}, ${uuidv7()}, now() + interval '1 hour')`;
    // Two admins demoting each other at once: only one may succeed.
    const results = await Promise.allSettled([
      updateUser(admin, other, { name: "Second", role: "CASHIER", isActive: false }),
      updateUser(otherStaff, admin.id, { name: "First", role: "CASHIER", isActive: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await sql`select count(*)::int as n from user_roles r join users u on u.id = r.user_id where r.branch_id = ${s.branchId} and r.role = 'ADMIN' and u.is_active`;
    expect(n).toBe(1);
    if (results[0].status === "fulfilled") {
      const [{ c }] = await sql`select count(*)::int as c from auth_sessions where user_id = ${other}`;
      expect(c).toBe(0);
    }
  });

  it("is admin only", async () => {
    const s = await seed();
    const cashier = await s.staff("CASHIER");
    await expect(listUsers(cashier)).rejects.toMatchObject({ status: 403 });
    await expect(createUser(cashier, { name: "x", email: "x@example.com", role: "ADMIN", password: "0123456789" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("settings (ADM-002)", () => {
  it("converts percentages without floats", () => {
    expect(percentToBps("14")).toBe(1400);
    expect(percentToBps("12.5")).toBe(1250);
    expect(percentToBps("0.07")).toBe(7);
    expect(() => percentToBps("101")).toThrow();
    expect(() => percentToBps("1.234")).toThrow();
    expect(bpsToPercent(1250)).toBe("12.5");
    expect(bpsToPercent(7)).toBe("0.07");
    expect(bpsToPercent(1400)).toBe("14");
  });

  it("saves tax and service used by new orders, audits it, and locks the currency once orders exist", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const base = await getSettings(admin);
    const { paymentMethods: _p, hasOrders: _h, logoUrl: _l, ...form } = base;
    void [_p, _h, _l];
    await updateSettings(admin, { ...form, taxPercent: "14", servicePercent: "12", prepWarnMinutes: 8, prepOverdueMinutes: 15 });
    const saved = await getSettings(admin);
    expect(saved).toMatchObject({ taxPercent: "14", servicePercent: "12", prepWarnMinutes: 8, hasOrders: false });
    const { totals } = await s.order([{ productId: s.tea, quantity: 1 }]);
    expect(totals).toMatchObject({ subtotalMinor: 1000, taxMinor: 140, serviceMinor: 120, totalMinor: 1260 });

    await expect(updateSettings(admin, { ...form, currency: "USD", taxPercent: "14", servicePercent: "12" })).rejects.toThrow(/currency cannot change/);
    await expect(updateSettings(admin, { ...form, prepWarnMinutes: 30, prepOverdueMinutes: 10 })).rejects.toThrow();
    const [audit] = await sql`select before, after from audit_logs where action = 'SETTINGS_UPDATED' and branch_id = ${s.branchId}`;
    expect(audit.before.taxPercent).toBe("0");
    expect(audit.after.taxPercent).toBe("14");

    await addPaymentMethod(admin, { code: "instapay", nameAr: "انستاباي", nameEn: "InstaPay" });
    await expect(addPaymentMethod(admin, { code: "INSTAPAY", nameAr: "x", nameEn: "x" })).rejects.toThrow(/already used/);
    expect((await getSettings(admin)).paymentMethods.map((m) => m.code)).toContain("INSTAPAY");
  });
});

describe("suppliers (ADM-003)", () => {
  it("creates and edits suppliers in the admin's own branch with audit", async () => {
    const s = await seed();
    const other = await seed();
    const admin = await s.staff("ADMIN");
    const row = await createSupplier(admin, { name: "Beans Co", email: "", phone: "0100" });
    expect(row).toMatchObject({ name: "Beans Co", email: null, phone: "0100", isActive: true });
    await expect(createSupplier(admin, { name: "Bad", email: "not-an-email" })).rejects.toThrow();
    await updateSupplier(admin, row.id, { name: "Beans Co", isActive: false });
    expect((await listSuppliers(admin)).map((x) => x.isActive)).toEqual([false]);
    await expect(updateSupplier(await other.staff("ADMIN"), row.id, { name: "Hijack" })).rejects.toThrow(/not found/);
    await expect(listSuppliers(await s.staff("CASHIER"))).rejects.toMatchObject({ status: 403 });
    const audits = await sql`select action from audit_logs where entity_id = ${row.id} order by created_at`;
    expect(audits.map((a) => a.action)).toEqual(["SUPPLIER_CREATED", "SUPPLIER_UPDATED"]);
  });
});

describe("order history and audit log (ADM-004, ADM-006)", () => {
  it("shows cashiers the last 7 days and admins everything, with full detail", async () => {
    const s = await seed();
    const admin = await s.staff("ADMIN");
    const cashier = await s.staff("CASHIER");
    const recent = await s.order([{ productId: s.coffee, quantity: 1 }]);
    const old = await s.order([{ productId: s.tea, quantity: 1 }]);
    await sql`update orders set business_date = business_date - 20 where id = ${old.orderId}`;
    await recordPayment(cashier, recent.orderId, 1, s.cash, 2550, "R-1");

    const all = await listOrderHistory(admin, { from: "2000-01-01" });
    expect(all.rows.map((r) => r.id).sort()).toEqual([recent.orderId, old.orderId].sort());
    const cashierView = await listOrderHistory(cashier, { from: "2000-01-01" });
    expect(cashierView.rows.map((r) => r.id)).toEqual([recent.orderId]);
    expect(await getOrderDetail(cashier, old.orderId)).toBeNull();
    const detail = await getOrderDetail(admin, recent.orderId);
    expect(detail?.payments).toMatchObject([{ kind: "PAYMENT", amountMinor: 2550, method: "Cash", reference: "R-1" }]);
    expect(detail?.events.map((e) => e.type)).toContain("ORDER_CREATED");
    expect(await getOrderDetail(await (await seed()).staff("ADMIN"), recent.orderId)).toBeNull();
    expect((await listOrderHistory(admin, { status: "PAID" })).rows.map((r) => r.id)).toEqual([recent.orderId]);
    await expect(listOrderHistory(await s.staff("KITCHEN"), {})).rejects.toMatchObject({ status: 403 });

    const audit = await listAudit(admin, {});
    expect(audit.rows.map((r) => r.action)).toContain("PAYMENT_RECORDED");
    await expect(listAudit(cashier, {})).rejects.toMatchObject({ status: 403 });
  });
});
