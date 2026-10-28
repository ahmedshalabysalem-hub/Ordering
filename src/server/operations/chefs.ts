import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { chefs } from "@/server/db/schema";
import { OperationError } from "./orders";

// Chefs the kitchen picks as responsible for an order (OPS-005, ADR-018). No chef login; chefs are
// deactivated, never deleted, so past orders keep their names.

export const chefInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export type ChefRow = typeof chefs.$inferSelect;

export async function listChefs(staff: StaffUser): Promise<ChefRow[]> {
  const branchId = branchFor(staff, "chefs.manage");
  return db.select().from(chefs).where(eq(chefs.branchId, branchId)).orderBy(asc(chefs.name));
}

export async function createChef(staff: StaffUser, raw: z.input<typeof chefInput>): Promise<ChefRow> {
  const branchId = branchFor(staff, "chefs.manage");
  const values = chefInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(chefs).values({ id: uuidv7(), branchId, ...values }).returning();
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "CHEF_CREATED", entityType: "chef", entityId: row.id, after: values });
    return row;
  });
}

export async function updateChef(staff: StaffUser, id: string, raw: z.input<typeof chefInput>): Promise<ChefRow> {
  const branchId = branchFor(staff, "chefs.manage");
  const values = chefInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(chefs)
      .where(and(eq(chefs.id, id), eq(chefs.branchId, branchId)))
      .for("update");
    if (!before) throw new OperationError("NOT_FOUND", "Chef not found.");
    const [row] = await tx.update(chefs).set(values).where(eq(chefs.id, id)).returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "CHEF_UPDATED",
      entityType: "chef",
      entityId: id,
      before: { name: before.name, phone: before.phone, isActive: before.isActive },
      after: values,
    });
    return row;
  });
}
