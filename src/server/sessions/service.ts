import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { assistanceRequests, branchSettings, diningTables, orders, tableSessions } from "@/server/db/schema";
import { publish } from "@/server/realtime/events";

// Table session lifecycle (ORD-002, ADR-008 §4). Sessions open with the first customer order
// (ORD-001). Staff move them OPEN → CLOSING → CLOSED; every move checks `version` so two cashiers
// acting at once cannot both succeed. Closing never touches the table's QR token (ADR-004).

export type SessionErrorCode = "NOT_FOUND" | "CONFLICT" | "WRONG_STATUS" | "UNSETTLED_ORDERS";

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
    readonly blockingOrders: BlockingOrder[] = [],
  ) {
    super(message);
  }
}

export type BlockingOrder = { orderId: string; orderRef: string; reasons: ("unpaid" | "not_delivered")[] };

type SessionRow = typeof tableSessions.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SETTLED_PAYMENT = ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"];

async function lockSession(tx: Tx, branchId: string, sessionId: string, version: number): Promise<SessionRow> {
  const [session] = await tx
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.branchId, branchId)))
    .for("update");
  if (!session) throw new SessionError("NOT_FOUND", "Table session not found.");
  if (session.version !== version) {
    throw new SessionError("CONFLICT", "Someone else changed this table just now. Refresh and try again.");
  }
  return session;
}

async function moveSession(
  staff: StaffUser,
  sessionId: string,
  version: number,
  from: SessionRow["status"][],
  to: "OPEN" | "CLOSING",
  action: string,
): Promise<SessionRow> {
  const branchId = branchFor(staff, "session.close");
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, branchId, sessionId, version);
    if (!from.includes(session.status)) throw new SessionError("WRONG_STATUS", `This table session is ${session.status.toLowerCase()}.`);
    const [row] = await tx
      .update(tableSessions)
      .set({ status: to, closingStartedAt: to === "CLOSING" ? sql`now()` : null, version: session.version + 1 })
      .where(eq(tableSessions.id, sessionId))
      .returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action,
      entityType: "table_session",
      entityId: sessionId,
      before: { status: session.status },
      after: { status: to },
    });
    await publish(tx, { type: "session.updated", branchId, sessionId, tableId: session.tableId });
    return row;
  });
}

/** OPEN → CLOSING: stops new customer orders while the cashier settles the table. */
export const startClosing = (staff: StaffUser, sessionId: string, version: number) =>
  moveSession(staff, sessionId, version, ["OPEN"], "CLOSING", "SESSION_CLOSING_STARTED");

/** CLOSING → OPEN: customers can order again. */
export const cancelClosing = (staff: StaffUser, sessionId: string, version: number) =>
  moveSession(staff, sessionId, version, ["CLOSING"], "OPEN", "SESSION_CLOSING_CANCELLED");

/**
 * OPEN or CLOSING → CLOSED. Refused while any order is unpaid, or (under the default policy) paid
 * but not delivered. Open assistance requests for the table are cancelled or resolved.
 */
export async function closeSession(staff: StaffUser, sessionId: string, version: number): Promise<SessionRow> {
  const branchId = branchFor(staff, "session.close");
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, branchId, sessionId, version);
    if (session.status === "CLOSED") throw new SessionError("WRONG_STATUS", "This table session is already closed.");

    const [settings] = await tx
      .select({ policy: branchSettings.sessionClosePolicy })
      .from(branchSettings)
      .where(eq(branchSettings.branchId, branchId));
    const requireDelivered = (settings?.policy ?? "ALL_PAID_AND_DELIVERED") === "ALL_PAID_AND_DELIVERED";

    const sessionOrders = await tx
      .select({
        id: orders.id,
        orderRef: orders.orderRef,
        kitchenStatus: orders.kitchenStatus,
        deliveryStatus: orders.deliveryStatus,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(eq(orders.sessionId, sessionId))
      .orderBy(asc(orders.seq));

    const blocking: BlockingOrder[] = [];
    for (const o of sessionOrders) {
      if (o.kitchenStatus === "CANCELLED") continue;
      const reasons: BlockingOrder["reasons"] = [];
      if (!SETTLED_PAYMENT.includes(o.paymentStatus)) reasons.push("unpaid");
      if (requireDelivered && o.deliveryStatus !== "DELIVERED") reasons.push("not_delivered");
      if (reasons.length > 0) blocking.push({ orderId: o.id, orderRef: o.orderRef, reasons });
    }
    if (blocking.length > 0) {
      throw new SessionError("UNSETTLED_ORDERS", "Some orders are not settled yet.", blocking);
    }

    const open = await tx
      .select({ id: assistanceRequests.id, status: assistanceRequests.status })
      .from(assistanceRequests)
      .where(and(eq(assistanceRequests.tableId, session.tableId), inArray(assistanceRequests.status, ["PENDING", "ACKNOWLEDGED"])));
    if (open.length > 0) {
      await tx
        .update(assistanceRequests)
        .set({ status: "CANCELLED", resolvedBy: staff.id, resolvedAt: sql`now()` })
        .where(and(eq(assistanceRequests.tableId, session.tableId), eq(assistanceRequests.status, "PENDING")));
      await tx
        .update(assistanceRequests)
        .set({ status: "RESOLVED", resolvedBy: staff.id, resolvedAt: sql`now()` })
        .where(and(eq(assistanceRequests.tableId, session.tableId), eq(assistanceRequests.status, "ACKNOWLEDGED")));
    }

    const [row] = await tx
      .update(tableSessions)
      .set({ status: "CLOSED", closedAt: sql`now()`, closedBy: staff.id, version: session.version + 1 })
      .where(eq(tableSessions.id, sessionId))
      .returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "SESSION_CLOSED",
      entityType: "table_session",
      entityId: sessionId,
      before: { status: session.status },
      after: { status: "CLOSED", orders: sessionOrders.length, assistanceClosed: open.length },
    });
    await publish(tx, { type: "session.updated", branchId, sessionId, tableId: session.tableId });
    if (open.length > 0) await publish(tx, { type: "assistance.updated", branchId, tableId: session.tableId });
    return row;
  });
}

export type TableColor = "available" | "new_order" | "ready" | "in_preparation" | "seated";

export type TableOverview = {
  tableId: string;
  number: number;
  name: string | null;
  section: string | null;
  isActive: boolean;
  session: { id: string; status: "OPEN" | "CLOSING"; version: number } | null;
  color: TableColor;
  awaitingPayment: boolean;
  assistancePending: boolean;
  orderCount: number;
};

type OrderState = { kitchenStatus: string; deliveryStatus: string; paymentStatus: string };

/** The cashier grid color from ADR-008 §6: first matching rule wins. Never stored. */
export function tableColor(hasSession: boolean, sessionOrders: OrderState[]): TableColor {
  if (!hasSession) return "available";
  const live = sessionOrders.filter((o) => o.kitchenStatus !== "CANCELLED");
  if (live.some((o) => o.kitchenStatus === "NEW")) return "new_order";
  if (live.some((o) => o.kitchenStatus === "READY" && o.deliveryStatus !== "DELIVERED")) return "ready";
  if (live.some((o) => o.kitchenStatus === "ACCEPTED" || o.kitchenStatus === "IN_PREPARATION")) return "in_preparation";
  return "seated";
}

/** Every table in the branch with its open session and derived status, for the cashier grid. */
export async function getTablesOverview(staff: StaffUser): Promise<TableOverview[]> {
  const branchId = branchFor(staff, "orders.view_operational");
  const [tables, sessions, sessionOrders, assistance] = await Promise.all([
    db.select().from(diningTables).where(eq(diningTables.branchId, branchId)).orderBy(asc(diningTables.number)),
    db
      .select({ id: tableSessions.id, tableId: tableSessions.tableId, status: tableSessions.status, version: tableSessions.version })
      .from(tableSessions)
      .where(and(eq(tableSessions.branchId, branchId), ne(tableSessions.status, "CLOSED"))),
    db
      .select({
        sessionId: orders.sessionId,
        kitchenStatus: orders.kitchenStatus,
        deliveryStatus: orders.deliveryStatus,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .innerJoin(tableSessions, eq(tableSessions.id, orders.sessionId))
      .where(and(eq(orders.branchId, branchId), ne(tableSessions.status, "CLOSED"))),
    db
      .select({ tableId: assistanceRequests.tableId })
      .from(assistanceRequests)
      .where(and(eq(assistanceRequests.branchId, branchId), eq(assistanceRequests.status, "PENDING"))),
  ]);

  return tables.map((t) => {
    const session = sessions.find((s) => s.tableId === t.id) ?? null;
    const own = session ? sessionOrders.filter((o) => o.sessionId === session.id) : [];
    const live = own.filter((o) => o.kitchenStatus !== "CANCELLED");
    return {
      tableId: t.id,
      number: t.number,
      name: t.name,
      section: t.section,
      isActive: t.isActive,
      session: session ? { id: session.id, status: session.status as "OPEN" | "CLOSING", version: session.version } : null,
      color: tableColor(session !== null, own),
      awaitingPayment: live.some((o) => !SETTLED_PAYMENT.includes(o.paymentStatus)),
      assistancePending: assistance.some((a) => a.tableId === t.id),
      orderCount: own.length,
    };
  });
}
