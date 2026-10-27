import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { assertCan, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { branches, diningTables, restaurants } from "@/server/db/schema";

// Tables and their permanent QR tokens (ADR-004). The token is created with the table and changes
// only through regenerateQrToken(), an explicit, audited admin action.

export class TableError extends Error {}

export const tableInput = z.object({
  number: z.coerce.number().int().min(1).max(9999),
  name: z.string().trim().max(60).optional().transform((v) => v || null),
  section: z.string().trim().max(60).optional().transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export type TableInput = z.input<typeof tableInput>;
export type TableRow = typeof diningTables.$inferSelect;

export const newQrToken = () => randomBytes(24).toString("base64url");

/** Builds the public ordering URL printed in a table's QR code. */
export function tableOrderUrl(baseUrl: string, qrToken: string) {
  return new URL(`/order/table/${encodeURIComponent(qrToken)}`, baseUrl).toString();
}

/** The branch the staff member manages tables in (single branch in the MVP). */
export function managedBranchId(staff: StaffUser): string {
  const branch = staff.roles.find((r) => r.role === "ADMIN");
  if (!branch) throw new TableError("No branch to manage.");
  return branch.branchId;
}

function isUniqueViolation(e: unknown, constraint: string) {
  const err = (e as { cause?: { code?: string; constraint_name?: string } }).cause ?? (e as { code?: string; constraint_name?: string });
  return err?.code === "23505" && err.constraint_name === constraint;
}

const duplicateNumber = (n: number) => new TableError(`Table ${n} already exists.`);

export async function listTables(staff: StaffUser): Promise<TableRow[]> {
  const branchId = managedBranchId(assertCan(staff, "tables.manage"));
  return db.select().from(diningTables).where(eq(diningTables.branchId, branchId)).orderBy(asc(diningTables.number));
}

export async function getTable(staff: StaffUser, id: string): Promise<TableRow | null> {
  const branchId = managedBranchId(assertCan(staff, "tables.manage"));
  const [row] = await db
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.id, id), eq(diningTables.branchId, branchId)));
  return row ?? null;
}

export async function createTable(staff: StaffUser, raw: TableInput): Promise<TableRow> {
  const branchId = managedBranchId(assertCan(staff, "tables.manage"));
  const input = tableInput.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(diningTables)
        .values({ id: uuidv7(), branchId, ...input, qrToken: newQrToken() })
        .returning();
      await writeAudit(tx, {
        branchId,
        actorUserId: staff.id,
        action: "TABLE_CREATED",
        entityType: "dining_table",
        entityId: row.id,
        after: { number: row.number, name: row.name, section: row.section, isActive: row.isActive },
      });
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e, "dining_tables_branch_number_uq")) throw duplicateNumber(input.number);
    throw e;
  }
}

/** Edits number, name, section or active flag. Never touches the QR token. */
export async function updateTable(staff: StaffUser, id: string, raw: TableInput): Promise<TableRow> {
  const branchId = managedBranchId(assertCan(staff, "tables.manage"));
  const input = tableInput.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.id, id), eq(diningTables.branchId, branchId)))
        .for("update");
      if (!before) throw new TableError("Table not found.");
      const [row] = await tx.update(diningTables).set(input).where(eq(diningTables.id, id)).returning();
      await writeAudit(tx, {
        branchId,
        actorUserId: staff.id,
        action: "TABLE_UPDATED",
        entityType: "dining_table",
        entityId: id,
        before: { number: before.number, name: before.name, section: before.section, isActive: before.isActive },
        after: { number: row.number, name: row.name, section: row.section, isActive: row.isActive },
      });
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e, "dining_tables_branch_number_uq")) throw duplicateNumber(input.number);
    throw e;
  }
}

/** Explicit admin action: issues a new QR token; the old printed code stops working immediately. */
export async function regenerateQrToken(staff: StaffUser, id: string, reason: string): Promise<TableRow> {
  const branchId = managedBranchId(assertCan(staff, "qr.regenerate"));
  const why = z.string().trim().min(3).max(200).parse(reason);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.id, id), eq(diningTables.branchId, branchId)))
      .for("update");
    if (!before) throw new TableError("Table not found.");
    const [row] = await tx
      .update(diningTables)
      .set({ qrToken: newQrToken(), qrTokenRotatedAt: new Date() })
      .where(eq(diningTables.id, id))
      .returning();
    // Tokens are not logged; the entry records that a rotation happened, by whom and why.
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "TABLE_QR_REGENERATED",
      entityType: "dining_table",
      entityId: id,
      reason: why,
    });
    return row;
  });
}

export type PublicTable =
  | { status: "active"; tableId: string; branchId: string; number: number; name: string | null; restaurantNameAr: string; restaurantNameEn: string }
  | { status: "inactive"; number: number; restaurantNameAr: string; restaurantNameEn: string }
  | { status: "not_found" };

/** Public lookup by QR token. Exposes only what the customer page needs. */
export async function resolveQrToken(qrToken: string): Promise<PublicTable> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(qrToken)) return { status: "not_found" };
  const [row] = await db
    .select({
      tableId: diningTables.id,
      branchId: diningTables.branchId,
      number: diningTables.number,
      name: diningTables.name,
      isActive: diningTables.isActive,
      branchActive: branches.isActive,
      restaurantNameAr: restaurants.nameAr,
      restaurantNameEn: restaurants.nameEn,
    })
    .from(diningTables)
    .innerJoin(branches, eq(branches.id, diningTables.branchId))
    .innerJoin(restaurants, eq(restaurants.id, branches.restaurantId))
    .where(eq(diningTables.qrToken, qrToken));
  if (!row) return { status: "not_found" };
  if (!row.isActive || !row.branchActive) {
    return { status: "inactive", number: row.number, restaurantNameAr: row.restaurantNameAr, restaurantNameEn: row.restaurantNameEn };
  }
  return {
    status: "active",
    tableId: row.tableId,
    branchId: row.branchId,
    number: row.number,
    name: row.name,
    restaurantNameAr: row.restaurantNameAr,
    restaurantNameEn: row.restaurantNameEn,
  };
}
