import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAudit } from "@/server/audit";
import { AuthError, branchFor, can, type Permission, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { captainAssignments, captains, orderEvents, orders } from "@/server/db/schema";
import { publish } from "@/server/realtime/events";

// Staff transitions on one order (OPS-001..003, ADR-008 §1–2, ADR-015). Each runs in a transaction,
// locks the order, checks `version`, records an order event (and an audit entry where ADR-008 says so)
// and publishes a real-time event that PostgreSQL delivers on commit.

export type OperationErrorCode = "NOT_FOUND" | "CONFLICT" | "WRONG_STATUS" | "INVALID";

export class OperationError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof orders.$inferSelect;
export type KitchenStatus = "ACCEPTED" | "IN_PREPARATION" | "READY";

const KITCHEN_FROM: Record<KitchenStatus, string[]> = {
  ACCEPTED: ["NEW"],
  IN_PREPARATION: ["NEW", "ACCEPTED"],
  READY: ["IN_PREPARATION"],
};

async function lockOrder(tx: Tx, branchId: string, orderId: string, version: number): Promise<OrderRow> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.branchId, branchId)))
    .for("update");
  if (!order) throw new OperationError("NOT_FOUND", "Order not found.");
  if (order.version !== version) throw new OperationError("CONFLICT", "Someone else changed this order just now. Refresh and try again.");
  return order;
}

async function finish(tx: Tx, order: OrderRow, changes: Partial<OrderRow>, event: { type: string; from?: string; to?: string; actor: string; data?: unknown }) {
  const [row] = await tx
    .update(orders)
    .set({ ...changes, version: order.version + 1, updatedAt: sql`now()` })
    .where(eq(orders.id, order.id))
    .returning();
  await tx.insert(orderEvents).values({
    id: uuidv7(),
    orderId: order.id,
    type: event.type,
    fromStatus: event.from ?? null,
    toStatus: event.to ?? null,
    actorUserId: event.actor,
    data: event.data ?? null,
  });
  await publish(tx, { type: "order.updated", branchId: order.branchId, orderId: order.id, sessionId: order.sessionId, tableId: order.tableId });
  return row;
}

/** Kitchen moves: NEW → ACCEPTED → IN_PREPARATION → READY (NEW → IN_PREPARATION allowed). */
export async function moveKitchenStatus(staff: StaffUser, orderId: string, version: number, to: KitchenStatus): Promise<OrderRow> {
  const branchId = branchFor(staff, "kitchen.transition");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, branchId, orderId, version);
    if (!KITCHEN_FROM[to].includes(order.kitchenStatus)) {
      throw new OperationError("WRONG_STATUS", `This order is ${order.kitchenStatus.toLowerCase().replace("_", " ")}.`);
    }
    return finish(tx, order, { kitchenStatus: to }, { type: "KITCHEN_STATUS", from: order.kitchenStatus, to, actor: staff.id });
  });
}

/**
 * Cancels an order with a reason. Before preparation: cashier or admin; once preparing or ready:
 * admin only. An order with money recorded against it must be refunded first (PAY-001).
 */
export async function cancelOrder(staff: StaffUser, orderId: string, version: number, reason: string): Promise<OrderRow> {
  const why = reason.trim();
  if (why.length < 3 || why.length > 300) throw new OperationError("INVALID", "Give a reason for the cancellation (3 to 300 characters).");
  const branchId = branchFor(staff, "orders.cancel_before_preparation");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, branchId, orderId, version);
    if (order.kitchenStatus === "CANCELLED") throw new OperationError("WRONG_STATUS", "This order is already cancelled.");
    const needed: Permission = ["NEW", "ACCEPTED"].includes(order.kitchenStatus) ? "orders.cancel_before_preparation" : "orders.cancel_after_preparation";
    if (!can(staff, needed, branchId)) throw new AuthError(403, "Only an admin can cancel an order that is being prepared or is ready.");
    if (order.paidMinor > 0) throw new OperationError("WRONG_STATUS", "This order has payments. Refund them before cancelling.");
    await tx
      .update(captainAssignments)
      .set({ unassignedAt: sql`now()` })
      .where(and(eq(captainAssignments.orderId, order.id), isNull(captainAssignments.unassignedAt)));
    const row = await finish(
      tx,
      order,
      { kitchenStatus: "CANCELLED", cancelReason: why, deliveryStatus: order.deliveryStatus === "DELIVERED" ? "DELIVERED" : "NOT_ASSIGNED" },
      { type: "CANCELLED", from: order.kitchenStatus, to: "CANCELLED", actor: staff.id, data: { reason: why } },
    );
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "ORDER_CANCELLED",
      entityType: "order",
      entityId: order.id,
      before: { kitchenStatus: order.kitchenStatus },
      after: { kitchenStatus: "CANCELLED" },
      reason: why,
    });
    return row;
  });
}

/** Assigns, reassigns (captainId) or unassigns (null) the order's captain (ADR-008 §2). */
export async function assignCaptain(staff: StaffUser, orderId: string, version: number, captainId: string | null): Promise<OrderRow> {
  const branchId = branchFor(staff, "captain.assign");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, branchId, orderId, version);
    if (order.kitchenStatus === "CANCELLED") throw new OperationError("WRONG_STATUS", "This order is cancelled.");
    if (order.deliveryStatus === "DELIVERED") throw new OperationError("WRONG_STATUS", "This order is already delivered.");
    let captainName: string | null = null;
    if (captainId) {
      const [captain] = await tx
        .select()
        .from(captains)
        .where(and(eq(captains.id, captainId), eq(captains.branchId, branchId)));
      if (!captain || !captain.isActive) throw new OperationError("INVALID", "Choose an active captain.");
      captainName = captain.name;
    } else if (order.deliveryStatus === "NOT_ASSIGNED") {
      throw new OperationError("WRONG_STATUS", "No captain is assigned.");
    }
    const [previous] = await tx
      .update(captainAssignments)
      .set({ unassignedAt: sql`now()` })
      .where(and(eq(captainAssignments.orderId, order.id), isNull(captainAssignments.unassignedAt)))
      .returning({ captainId: captainAssignments.captainId });
    if (captainId) {
      await tx.insert(captainAssignments).values({ id: uuidv7(), orderId: order.id, captainId, assignedBy: staff.id });
    }
    const to = captainId ? "ASSIGNED" : "NOT_ASSIGNED";
    const row = await finish(tx, order, { deliveryStatus: to }, {
      type: captainId ? (previous ? "CAPTAIN_REASSIGNED" : "CAPTAIN_ASSIGNED") : "CAPTAIN_UNASSIGNED",
      from: order.deliveryStatus,
      to,
      actor: staff.id,
      data: { captainId, captainName, previousCaptainId: previous?.captainId ?? null },
    });
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: captainId ? "CAPTAIN_ASSIGNED" : "CAPTAIN_UNASSIGNED",
      entityType: "order",
      entityId: order.id,
      before: { captainId: previous?.captainId ?? null },
      after: { captainId },
    });
    return row;
  });
}

/**
 * Marks a READY order as served. ADR-015: allowed with or without an assigned captain, because a
 * small café may serve from the counter without captains.
 */
export async function markDelivered(staff: StaffUser, orderId: string, version: number): Promise<OrderRow> {
  const branchId = branchFor(staff, "delivery.confirm");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, branchId, orderId, version);
    if (order.kitchenStatus !== "READY") throw new OperationError("WRONG_STATUS", "Only a ready order can be marked as served.");
    if (order.deliveryStatus === "DELIVERED") throw new OperationError("WRONG_STATUS", "This order is already served.");
    return finish(tx, order, { deliveryStatus: "DELIVERED" }, { type: "DELIVERED", from: order.deliveryStatus, to: "DELIVERED", actor: staff.id });
  });
}
