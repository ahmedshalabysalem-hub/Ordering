import { and, eq, inArray, sql } from "drizzle-orm";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { assistanceRequests } from "@/server/db/schema";
import { publish } from "@/server/realtime/events";
import { OperationError } from "./orders";

// Staff handling of "Request Assistance" (OPS-004, ADR-008 §5). Each move is one conditional update,
// so two staff members acting at once cannot both succeed.

type Move = "acknowledge" | "resolve" | "cancel";

const MOVES: Record<Move, { from: string[]; to: string }> = {
  acknowledge: { from: ["PENDING"], to: "ACKNOWLEDGED" },
  resolve: { from: ["PENDING", "ACKNOWLEDGED"], to: "RESOLVED" },
  cancel: { from: ["PENDING"], to: "CANCELLED" },
};

export async function handleAssistance(staff: StaffUser, requestId: string, move: Move) {
  const branchId = branchFor(staff, "assistance.handle");
  const { from, to } = MOVES[move];
  return db.transaction(async (tx) => {
    const changes =
      to === "ACKNOWLEDGED"
        ? { status: to, acknowledgedBy: staff.id, acknowledgedAt: sql`now()` }
        : { status: to, resolvedBy: staff.id, resolvedAt: sql`now()` };
    const [row] = await tx
      .update(assistanceRequests)
      .set(changes)
      .where(and(eq(assistanceRequests.id, requestId), eq(assistanceRequests.branchId, branchId), inArray(assistanceRequests.status, from)))
      .returning();
    if (!row) {
      const [existing] = await tx
        .select({ status: assistanceRequests.status })
        .from(assistanceRequests)
        .where(and(eq(assistanceRequests.id, requestId), eq(assistanceRequests.branchId, branchId)));
      if (!existing) throw new OperationError("NOT_FOUND", "Assistance request not found.");
      throw new OperationError("WRONG_STATUS", `This request is already ${existing.status.toLowerCase()}.`);
    }
    await publish(tx, { type: "assistance.updated", branchId, tableId: row.tableId });
    return row;
  });
}
