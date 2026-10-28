import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { AuthError, can, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { auditLogs, branches, captainAssignments, captains, chefs, orderEvents, orderItemModifiers, orderItems, orders, paymentMethods, payments, users } from "@/server/db/schema";
import { OPERATIONAL_DAYS, resolveRange, type ReportRange } from "./reports";

// Order history and the audit log viewer (ADM-004, ADM-006, ADR-017). Admins see all history; cashiers
// see the last 7 business days (ADR-008). Read-only: nothing here changes an order or an audit row.

const PAGE_SIZE = 50;

type HistoryAccess = { branchId: string; full: boolean };

function historyAccess(staff: StaffUser): HistoryAccess {
  for (const r of staff.roles) if (can(staff, "orders.history_full", r.branchId)) return { branchId: r.branchId, full: true };
  for (const r of staff.roles) if (can(staff, "orders.history_recent", r.branchId)) return { branchId: r.branchId, full: false };
  throw new AuthError(403);
}

async function today(branchId: string): Promise<{ today: string; currency: string; timezone: string }> {
  const [row] = await db.execute<{ today: string; currency: string; timezone: string }>(
    sql`select to_char(now() at time zone timezone, 'YYYY-MM-DD') as today, currency, timezone from ${branches} where id = ${branchId}`,
  );
  return row;
}

export type HistoryFilter = Partial<ReportRange> & { table?: string; status?: string; q?: string; page?: string };

export type HistoryRow = {
  id: string;
  orderRef: string;
  tableNumber: number;
  createdAt: Date;
  kitchenStatus: string;
  deliveryStatus: string;
  paymentStatus: string;
  totalMinor: number;
  paidMinor: number;
  chef: string | null;
};

export async function listOrderHistory(staff: StaffUser, filter: HistoryFilter) {
  const { branchId, full } = historyAccess(staff);
  const branch = await today(branchId);
  const range = resolveRange(filter, branch.today, full);
  const where: SQL[] = [eq(orders.branchId, branchId), gte(orders.businessDate, range.from), lte(orders.businessDate, range.to)];
  const table = Number(filter.table);
  if (filter.table && Number.isInteger(table) && table > 0) where.push(eq(orders.tableNumberSnapshot, table));
  if (filter.status) {
    if (["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(filter.status)) where.push(eq(orders.paymentStatus, filter.status));
    else where.push(eq(orders.kitchenStatus, filter.status));
  }
  const q = filter.q?.trim();
  if (q) where.push(sql`${orders.orderRef} ilike ${`%${q.replace(/[%_\\]/g, "\\$&")}%`}`);
  const page = Math.max(1, Math.min(1000, Number.parseInt(filter.page ?? "1", 10) || 1));

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderRef: orders.orderRef,
        tableNumber: orders.tableNumberSnapshot,
        createdAt: orders.createdAt,
        kitchenStatus: orders.kitchenStatus,
        deliveryStatus: orders.deliveryStatus,
        paymentStatus: orders.paymentStatus,
        totalMinor: orders.totalMinor,
        paidMinor: orders.paidMinor,
        chef: chefs.name,
      })
      .from(orders)
      .leftJoin(chefs, eq(chefs.id, orders.chefId))
      .where(and(...where))
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(...where)),
  ]);
  return { rows: rows as HistoryRow[], total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)), range, full, currency: branch.currency, timezone: branch.timezone, recentDays: OPERATIONAL_DAYS };
}

export async function getOrderDetail(staff: StaffUser, orderId: string) {
  const { branchId, full } = historyAccess(staff);
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.branchId, branchId)));
  if (!order) return null;
  const branch = await today(branchId);
  if (!full) {
    const t = branch.today;
    if (resolveRange({ from: order.businessDate, to: order.businessDate }, t, false).from !== order.businessDate) return null;
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
  const [modifiers, events, paymentRows, assignments, chef] = await Promise.all([
    items.length
      ? db
          .select()
          .from(orderItemModifiers)
          .where(
            inArray(
              orderItemModifiers.orderItemId,
              items.map((i) => i.id),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ type: orderEvents.type, fromStatus: orderEvents.fromStatus, toStatus: orderEvents.toStatus, data: orderEvents.data, createdAt: orderEvents.createdAt, actor: users.name })
      .from(orderEvents)
      .leftJoin(users, eq(users.id, orderEvents.actorUserId))
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(asc(orderEvents.createdAt)),
    db
      .select({ kind: payments.kind, amountMinor: payments.amountMinor, method: paymentMethods.nameEn, reference: payments.reference, reason: payments.reason, recordedAt: payments.recordedAt, by: users.name })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .innerJoin(users, eq(users.id, payments.recordedBy))
      .where(eq(payments.orderId, orderId))
      .orderBy(asc(payments.recordedAt)),
    db
      .select({ captain: captains.name, assignedAt: captainAssignments.assignedAt, unassignedAt: captainAssignments.unassignedAt })
      .from(captainAssignments)
      .innerJoin(captains, eq(captains.id, captainAssignments.captainId))
      .where(eq(captainAssignments.orderId, orderId))
      .orderBy(asc(captainAssignments.assignedAt)),
    order.chefId ? db.select({ name: chefs.name }).from(chefs).where(eq(chefs.id, order.chefId)) : Promise.resolve([]),
  ]);
  return {
    order,
    timezone: branch.timezone,
    items: items.map((i) => ({ ...i, modifiers: modifiers.filter((m) => m.orderItemId === i.id) })),
    events,
    payments: paymentRows,
    assignments,
    chef: chef[0]?.name ?? null,
  };
}

export type AuditFilter = Partial<ReportRange> & { action?: string; entity?: string; page?: string };

/** Audit records for the branch, newest first. Read-only (SPEC §21). */
export async function listAudit(staff: StaffUser, filter: AuditFilter) {
  const branchId = (() => {
    for (const r of staff.roles) if (can(staff, "audit.view", r.branchId)) return r.branchId;
    throw new AuthError(403);
  })();
  const branch = await today(branchId);
  const range = resolveRange(filter, branch.today, true);
  const where: SQL[] = [
    eq(auditLogs.branchId, branchId),
    sql`${auditLogs.createdAt} >= (${range.from}::date::timestamp at time zone ${branch.timezone})`,
    sql`${auditLogs.createdAt} < ((${range.to}::date + 1)::timestamp at time zone ${branch.timezone})`,
  ];
  if (filter.action?.trim()) where.push(eq(auditLogs.action, filter.action.trim().toUpperCase()));
  if (filter.entity?.trim()) where.push(eq(auditLogs.entityType, filter.entity.trim()));
  const page = Math.max(1, Math.min(1000, Number.parseInt(filter.page ?? "1", 10) || 1));
  const [rows, [{ n }], actions] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        before: auditLogs.before,
        after: auditLogs.after,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
        actor: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(and(...where)),
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.branchId, branchId)).orderBy(asc(auditLogs.action)),
  ]);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)), range, timezone: branch.timezone, actions: actions.map((a) => a.action) };
}
