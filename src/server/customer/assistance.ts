import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db/client";
import { assistanceRequests, branchSettings, diningTables, tableSessions } from "@/server/db/schema";
import { QR_TOKEN } from "@/server/orders/create";

// "Request Assistance" from a table QR code (UI-005, ADR-013, SPEC §6.6). One pending request per
// table, plus a cooldown after the last one. Customers get back only their own request's state.

export type AssistanceErrorCode = "TABLE_NOT_FOUND" | "TABLE_INACTIVE" | "ASSISTANCE_COOLDOWN";

export class AssistanceError extends Error {
  constructor(
    readonly code: AssistanceErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }

  get status(): 404 | 409 | 429 {
    return this.code === "TABLE_NOT_FOUND" ? 404 : this.code === "TABLE_INACTIVE" ? 409 : 429;
  }
}

export type AssistanceResult = { status: "PENDING"; createdAt: string; deduplicated: boolean };

export async function requestAssistance(qrToken: string, now = new Date()): Promise<AssistanceResult> {
  if (!QR_TOKEN.test(qrToken)) throw new AssistanceError("TABLE_NOT_FOUND", "This QR code is not valid.");
  return db.transaction(async (tx) => {
    // Locking the table serialises taps from several phones at the same table.
    const [table] = await tx
      .select({ id: diningTables.id, branchId: diningTables.branchId, isActive: diningTables.isActive })
      .from(diningTables)
      .where(eq(diningTables.qrToken, qrToken))
      .for("update");
    if (!table) throw new AssistanceError("TABLE_NOT_FOUND", "This QR code is not valid.");
    if (!table.isActive) throw new AssistanceError("TABLE_INACTIVE", "This table is not taking requests right now.");

    const [last] = await tx
      .select({ status: assistanceRequests.status, createdAt: assistanceRequests.createdAt })
      .from(assistanceRequests)
      .where(eq(assistanceRequests.tableId, table.id))
      .orderBy(desc(assistanceRequests.createdAt))
      .limit(1);
    if (last?.status === "PENDING") {
      return { status: "PENDING", createdAt: last.createdAt.toISOString(), deduplicated: true };
    }

    const [settings] = await tx
      .select({ cooldown: branchSettings.assistanceCooldownSeconds })
      .from(branchSettings)
      .where(eq(branchSettings.branchId, table.branchId));
    const cooldownMs = (settings?.cooldown ?? 60) * 1000;
    if (last && now.getTime() - last.createdAt.getTime() < cooldownMs) {
      const retryAfterSeconds = Math.ceil((last.createdAt.getTime() + cooldownMs - now.getTime()) / 1000);
      throw new AssistanceError("ASSISTANCE_COOLDOWN", "Staff were just called. Please wait a moment.", retryAfterSeconds);
    }

    const [session] = await tx
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, table.id), ne(tableSessions.status, "CLOSED")));
    const [row] = await tx
      .insert(assistanceRequests)
      .values({ id: uuidv7(), branchId: table.branchId, tableId: table.id, sessionId: session?.id ?? null, createdAt: now })
      .returning({ createdAt: assistanceRequests.createdAt });
    return { status: "PENDING", createdAt: row.createdAt.toISOString(), deduplicated: false };
  });
}
