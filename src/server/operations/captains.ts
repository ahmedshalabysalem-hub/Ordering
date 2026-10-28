import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { captains } from "@/server/db/schema";
import { OperationError } from "./orders";

// Captains (waiters) the cashier assigns orders to (OPS-003, ADR-008 §2). No captain login in the MVP;
// captains are deactivated, never deleted, so past assignments keep their names.

export const captainInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export type CaptainRow = typeof captains.$inferSelect;

export async function listCaptains(staff: StaffUser): Promise<CaptainRow[]> {
  const branchId = branchFor(staff, "captains.manage");
  return db.select().from(captains).where(eq(captains.branchId, branchId)).orderBy(asc(captains.name));
}

export async function createCaptain(staff: StaffUser, raw: z.input<typeof captainInput>): Promise<CaptainRow> {
  const branchId = branchFor(staff, "captains.manage");
  const values = captainInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(captains).values({ id: uuidv7(), branchId, ...values }).returning();
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "CAPTAIN_CREATED", entityType: "captain", entityId: row.id, after: values });
    return row;
  });
}

export async function updateCaptain(staff: StaffUser, id: string, raw: z.input<typeof captainInput>): Promise<CaptainRow> {
  const branchId = branchFor(staff, "captains.manage");
  const values = captainInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(captains)
      .where(and(eq(captains.id, id), eq(captains.branchId, branchId)))
      .for("update");
    if (!before) throw new OperationError("NOT_FOUND", "Captain not found.");
    const [row] = await tx.update(captains).set(values).where(eq(captains.id, id)).returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "CAPTAIN_UPDATED",
      entityType: "captain",
      entityId: id,
      before: { name: before.name, phone: before.phone, isActive: before.isActive },
      after: values,
    });
    return row;
  });
}
