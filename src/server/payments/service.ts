import { and, asc, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { orderEvents, orders, paymentMethods, payments, tableSessions } from "@/server/db/schema";
import { OperationError } from "@/server/operations/orders";
import { publish } from "@/server/realtime/events";
import { derivePaymentStatus } from "./status";

// Manual payment recording (PAY-001, ADR-008 §3, ADR-016). Recording a card payment here means the
// cashier took the card on a separate terminal; this app never processes cards (SPEC §17).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof orders.$inferSelect;

export type PaymentMethod = { id: string; code: string; nameEn: string; nameAr: string };

export async function listPaymentMethods(staff: StaffUser): Promise<PaymentMethod[]> {
  const branchId = branchFor(staff, "payments.record");
  return db
    .select({ id: paymentMethods.id, code: paymentMethods.code, nameEn: paymentMethods.nameEn, nameAr: paymentMethods.nameAr })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.branchId, branchId), eq(paymentMethods.isActive, true)))
    .orderBy(asc(paymentMethods.createdAt));
}

async function activeMethod(tx: Tx, branchId: string, methodId: string) {
  const [method] = await tx
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, methodId), eq(paymentMethods.branchId, branchId)));
  if (!method || !method.isActive) throw new OperationError("INVALID", "Choose an active payment method.");
  return method;
}

/** Inserts one payment or refund row and re-derives the order's paid amount and status. */
async function applyPayment(
  tx: Tx,
  staff: StaffUser,
  order: OrderRow,
  entry: { kind: "PAYMENT" | "REFUND"; methodId: string; methodCode: string; amountMinor: number; reference: string | null; reason: string | null },
) {
  await tx.insert(payments).values({
    id: uuidv7(),
    orderId: order.id,
    methodId: entry.methodId,
    kind: entry.kind,
    amountMinor: entry.amountMinor,
    currency: order.currency,
    reference: entry.reference,
    reason: entry.reason,
    recordedBy: staff.id,
  });
  const [sums] = await tx
    .select({
      paid: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.kind} = 'PAYMENT'), 0)`,
      refunded: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.kind} = 'REFUND'), 0)`,
    })
    .from(payments)
    .where(eq(payments.orderId, order.id));
  const { status, netMinor } = derivePaymentStatus(order.totalMinor, Number(sums.paid), Number(sums.refunded));
  const [row] = await tx
    .update(orders)
    .set({ paidMinor: netMinor, paymentStatus: status, version: order.version + 1, updatedAt: sql`now()` })
    .where(eq(orders.id, order.id))
    .returning();
  const type = entry.kind === "PAYMENT" ? "PAYMENT_RECORDED" : "REFUND_RECORDED";
  await tx.insert(orderEvents).values({
    id: uuidv7(),
    orderId: order.id,
    type,
    fromStatus: order.paymentStatus,
    toStatus: status,
    actorUserId: staff.id,
    data: { amountMinor: entry.amountMinor, method: entry.methodCode, reference: entry.reference },
  });
  await writeAudit(tx, {
    branchId: order.branchId,
    actorUserId: staff.id,
    action: type,
    entityType: "order",
    entityId: order.id,
    before: { paidMinor: order.paidMinor, paymentStatus: order.paymentStatus },
    after: { paidMinor: netMinor, paymentStatus: status, amountMinor: entry.amountMinor, method: entry.methodCode },
    reason: entry.reason,
  });
  await publish(tx, { type: "order.updated", branchId: order.branchId, orderId: order.id, sessionId: order.sessionId, tableId: order.tableId });
  return row;
}

const cleanReference = (reference?: string | null) => reference?.trim().slice(0, 100) || null;

/**
 * Records full payment of one order. Partial payments are off in the MVP, so the amount is always the
 * outstanding balance; `expectedAmountMinor` guards against paying from a stale screen.
 */
export async function recordPayment(staff: StaffUser, orderId: string, version: number, methodId: string, expectedAmountMinor: number, reference?: string | null) {
  const branchId = branchFor(staff, "payments.record");
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.branchId, branchId)))
      .for("update");
    if (!order) throw new OperationError("NOT_FOUND", "Order not found.");
    if (order.version !== version) throw new OperationError("CONFLICT", "Someone else changed this order just now. Refresh and try again.");
    return payOrder(tx, staff, order, branchId, methodId, expectedAmountMinor, cleanReference(reference));
  });
}

async function payOrder(tx: Tx, staff: StaffUser, order: OrderRow, branchId: string, methodId: string, expectedAmountMinor: number, reference: string | null) {
  if (order.kitchenStatus === "CANCELLED") throw new OperationError("WRONG_STATUS", "A cancelled order cannot be paid.");
  const outstanding = order.totalMinor - order.paidMinor;
  if (outstanding <= 0) throw new OperationError("WRONG_STATUS", `Order ${order.orderRef} is already paid.`);
  if (expectedAmountMinor !== outstanding) throw new OperationError("CONFLICT", "The amount due has changed. Refresh and try again.");
  const method = await activeMethod(tx, branchId, methodId);
  return applyPayment(tx, staff, order, { kind: "PAYMENT", methodId, methodCode: method.code, amountMinor: outstanding, reference, reason: null });
}

/** Pays every unpaid, not cancelled order of a table session at once (one method, one tap). */
export async function recordSessionPayment(staff: StaffUser, sessionId: string, methodId: string, expectedTotalMinor: number, reference?: string | null) {
  const branchId = branchFor(staff, "payments.record");
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.branchId, branchId)));
    if (!session) throw new OperationError("NOT_FOUND", "Table session not found.");
    const due = (
      await tx
        .select()
        .from(orders)
        .where(eq(orders.sessionId, sessionId))
        .orderBy(asc(orders.createdAt))
        .for("update")
    ).filter((o) => o.kitchenStatus !== "CANCELLED" && o.totalMinor > o.paidMinor);
    const total = due.reduce((sum, o) => sum + o.totalMinor - o.paidMinor, 0);
    if (due.length === 0) throw new OperationError("WRONG_STATUS", "Nothing is due for this table.");
    if (total !== expectedTotalMinor) throw new OperationError("CONFLICT", "The amount due has changed. Refresh and try again.");
    const ref = cleanReference(reference);
    for (const order of due) await payOrder(tx, staff, order, branchId, methodId, order.totalMinor - order.paidMinor, ref);
    return { orders: due.length, totalMinor: total };
  });
}

/**
 * Admin-only refund of up to the net amount paid, with a reason (ADR-008 §3). Without a method, the
 * refund goes back the way the last payment came in.
 */
export async function recordRefund(staff: StaffUser, orderId: string, version: number, methodId: string | null, amountMinor: number, reason: string) {
  const branchId = branchFor(staff, "payments.refund");
  const why = reason.trim();
  if (why.length < 3 || why.length > 300) throw new OperationError("INVALID", "Give a reason for the refund (3 to 300 characters).");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new OperationError("INVALID", "Enter a refund amount.");
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.branchId, branchId)))
      .for("update");
    if (!order) throw new OperationError("NOT_FOUND", "Order not found.");
    if (order.version !== version) throw new OperationError("CONFLICT", "Someone else changed this order just now. Refresh and try again.");
    if (amountMinor > order.paidMinor) throw new OperationError("INVALID", "A refund cannot be more than the amount paid.");
    const [last] = await tx
      .select({ methodId: payments.methodId })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.kind, "PAYMENT")))
      .orderBy(desc(payments.recordedAt))
      .limit(1);
    const chosen = methodId ?? last?.methodId;
    if (!chosen) throw new OperationError("INVALID", "Choose a payment method for the refund.");
    const [method] = await tx.select().from(paymentMethods).where(and(eq(paymentMethods.id, chosen), eq(paymentMethods.branchId, branchId)));
    if (!method) throw new OperationError("INVALID", "Choose a payment method for the refund.");
    return applyPayment(tx, staff, order, { kind: "REFUND", methodId: chosen, methodCode: method.code, amountMinor, reference: null, reason: why });
  });
}
