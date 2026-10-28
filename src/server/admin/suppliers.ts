import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { suppliers } from "@/server/db/schema";

// Basic supplier records (ADM-003, SPEC §13). No purchasing or stock: those are separate future
// modules. Suppliers are deactivated, never deleted.

export class SupplierError extends Error {}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const supplierInput = z.object({
  name: z.string().trim().min(1, "Enter the supplier name.").max(120),
  contactPerson: optional(100),
  phone: optional(30),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address."),
  address: optional(300),
  taxNumber: optional(50),
  notes: optional(1000),
  isActive: z.boolean().default(true),
});

export type SupplierRow = typeof suppliers.$inferSelect;

export async function listSuppliers(staff: StaffUser): Promise<SupplierRow[]> {
  const branchId = branchFor(staff, "suppliers.manage");
  return db.select().from(suppliers).where(eq(suppliers.branchId, branchId)).orderBy(asc(suppliers.name));
}

export async function getSupplier(staff: StaffUser, id: string): Promise<SupplierRow | null> {
  const branchId = branchFor(staff, "suppliers.manage");
  const [row] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.branchId, branchId)));
  return row ?? null;
}

export async function createSupplier(staff: StaffUser, raw: z.input<typeof supplierInput>): Promise<SupplierRow> {
  const branchId = branchFor(staff, "suppliers.manage");
  const values = supplierInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(suppliers).values({ id: uuidv7(), branchId, ...values }).returning();
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "SUPPLIER_CREATED", entityType: "supplier", entityId: row.id, after: values });
    return row;
  });
}

export async function updateSupplier(staff: StaffUser, id: string, raw: z.input<typeof supplierInput>): Promise<SupplierRow> {
  const branchId = branchFor(staff, "suppliers.manage");
  const values = supplierInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.branchId, branchId)))
      .for("update");
    if (!before) throw new SupplierError("Supplier not found.");
    const [row] = await tx.update(suppliers).set(values).where(eq(suppliers.id, id)).returning();
    const { id: _id, branchId: _b, createdAt: _c, updatedAt: _u, ...beforeValues } = before;
    void [_id, _b, _c, _u];
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "SUPPLIER_UPDATED", entityType: "supplier", entityId: id, before: beforeValues, after: values });
    return row;
  });
}
