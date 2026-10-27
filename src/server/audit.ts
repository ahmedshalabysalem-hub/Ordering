import { v7 as uuidv7 } from "uuid";
import type { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

type Executor = Pick<typeof db, "insert">;

export type AuditEntry = {
  branchId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/** Appends an audit entry (SPEC §21). Pass the transaction so the entry commits with the change. */
export async function writeAudit(tx: Executor, entry: AuditEntry) {
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    branchId: entry.branchId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
