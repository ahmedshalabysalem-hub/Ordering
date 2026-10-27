import { and, asc, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { branches, modifierGroups, modifierOptions, productModifierGroups, products } from "@/server/db/schema";
import { parseMoney } from "@/server/money";
import { MenuError } from "./service";

// Modifier groups ("Size", "Extras") and their options (MENU-002, SPEC §6.4). Groups are shared and
// linked to products. Like the rest of the menu, nothing is deleted and every change is audited.

const name = z.string().trim().min(1).max(80);
const count = z.coerce.number().int().min(0).max(20);

export const groupInput = z
  .object({
    nameAr: name,
    nameEn: name,
    minSelect: count.default(0),
    maxSelect: count.default(1),
    isActive: z.boolean().default(true),
  })
  .refine((g) => g.maxSelect >= Math.max(g.minSelect, 1), {
    path: ["maxSelect"],
    message: "Maximum must be at least 1 and not less than the minimum.",
  });

export const optionInput = z.object({
  nameAr: name,
  nameEn: name,
  priceDelta: z.string().default(""),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type GroupInput = z.input<typeof groupInput>;
export type OptionInput = z.input<typeof optionInput>;
export type GroupRow = typeof modifierGroups.$inferSelect;
export type OptionRow = typeof modifierOptions.$inferSelect;
export type GroupWithOptions = GroupRow & { options: OptionRow[] };

const groupSnapshot = (g: GroupRow) => ({ nameAr: g.nameAr, nameEn: g.nameEn, minSelect: g.minSelect, maxSelect: g.maxSelect, isActive: g.isActive });
const optionSnapshot = (o: OptionRow) => ({
  groupId: o.groupId,
  nameAr: o.nameAr,
  nameEn: o.nameEn,
  priceDeltaMinor: o.priceDeltaMinor,
  isAvailable: o.isAvailable,
  sortOrder: o.sortOrder,
});

async function optionValues(branchId: string, raw: OptionInput) {
  const { priceDelta, ...input } = optionInput.parse(raw);
  if (!priceDelta.trim()) return { ...input, priceDeltaMinor: 0 };
  const [branch] = await db.select({ currency: branches.currency }).from(branches).where(eq(branches.id, branchId));
  return { ...input, priceDeltaMinor: parseMoney(priceDelta, branch.currency) };
}

/** All groups in the branch with their options, in display order. */
export async function listModifierGroups(staff: StaffUser): Promise<GroupWithOptions[]> {
  const branchId = branchFor(staff, "menu.manage");
  const groups = await db.select().from(modifierGroups).where(eq(modifierGroups.branchId, branchId)).orderBy(asc(modifierGroups.nameEn));
  if (groups.length === 0) return [];
  const options = await db
    .select()
    .from(modifierOptions)
    .where(
      inArray(
        modifierOptions.groupId,
        groups.map((g) => g.id),
      ),
    )
    .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.nameEn));
  return groups.map((g) => ({ ...g, options: options.filter((o) => o.groupId === g.id) }));
}

export async function getModifierGroup(staff: StaffUser, id: string): Promise<GroupWithOptions | null> {
  const groups = await listModifierGroups(staff);
  return groups.find((g) => g.id === id) ?? null;
}

export async function createModifierGroup(staff: StaffUser, raw: GroupInput): Promise<GroupRow> {
  const branchId = branchFor(staff, "menu.manage");
  const input = groupInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(modifierGroups)
      .values({ id: uuidv7(), branchId, ...input })
      .returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "MODIFIER_GROUP_CREATED",
      entityType: "modifier_group",
      entityId: row.id,
      after: groupSnapshot(row),
    });
    return row;
  });
}

export async function updateModifierGroup(staff: StaffUser, id: string, raw: GroupInput): Promise<GroupRow> {
  const branchId = branchFor(staff, "menu.manage");
  const input = groupInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(modifierGroups)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.branchId, branchId)))
      .for("update");
    if (!before) throw new MenuError("Option group not found.");
    const [row] = await tx.update(modifierGroups).set(input).where(eq(modifierGroups.id, id)).returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "MODIFIER_GROUP_UPDATED",
      entityType: "modifier_group",
      entityId: id,
      before: groupSnapshot(before),
      after: groupSnapshot(row),
    });
    return row;
  });
}

export async function addModifierOption(staff: StaffUser, groupId: string, raw: OptionInput): Promise<OptionRow> {
  const branchId = branchFor(staff, "menu.manage");
  const values = await optionValues(branchId, raw);
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: modifierGroups.id })
      .from(modifierGroups)
      .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.branchId, branchId)));
    if (!group) throw new MenuError("Option group not found.");
    const [row] = await tx
      .insert(modifierOptions)
      .values({ id: uuidv7(), groupId, ...values })
      .returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "MODIFIER_OPTION_CREATED",
      entityType: "modifier_option",
      entityId: row.id,
      after: optionSnapshot(row),
    });
    return row;
  });
}

export async function updateModifierOption(staff: StaffUser, id: string, raw: OptionInput): Promise<OptionRow> {
  const branchId = branchFor(staff, "menu.manage");
  const values = await optionValues(branchId, raw);
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ option: modifierOptions })
      .from(modifierOptions)
      .innerJoin(modifierGroups, eq(modifierGroups.id, modifierOptions.groupId))
      .where(and(eq(modifierOptions.id, id), eq(modifierGroups.branchId, branchId)))
      .for("update", { of: modifierOptions });
    if (!found) throw new MenuError("Option not found.");
    const before = found.option;
    const [row] = await tx.update(modifierOptions).set(values).where(eq(modifierOptions.id, id)).returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: before.priceDeltaMinor === row.priceDeltaMinor ? "MODIFIER_OPTION_UPDATED" : "MODIFIER_OPTION_PRICE_CHANGED",
      entityType: "modifier_option",
      entityId: id,
      before: optionSnapshot(before),
      after: optionSnapshot(row),
    });
    return row;
  });
}

/** Group ids linked to a product, in the order the customer sees them. */
export async function getProductModifierGroupIds(staff: StaffUser, productId: string): Promise<string[]> {
  const branchId = branchFor(staff, "menu.manage");
  const rows = await db
    .select({ groupId: productModifierGroups.groupId })
    .from(productModifierGroups)
    .innerJoin(products, eq(products.id, productModifierGroups.productId))
    .where(and(eq(productModifierGroups.productId, productId), eq(products.branchId, branchId)))
    .orderBy(asc(productModifierGroups.sortOrder));
  return rows.map((r) => r.groupId);
}

/** Replaces the product's option groups with `groupIds`, in that order. */
export async function setProductModifierGroups(staff: StaffUser, productId: string, groupIds: string[]): Promise<void> {
  const branchId = branchFor(staff, "menu.manage");
  const ids = z.array(z.uuid()).max(20).parse([...new Set(groupIds)]);
  await db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.branchId, branchId)))
      .for("update");
    if (!product) throw new MenuError("Product not found.");
    if (ids.length > 0) {
      const groups = await tx
        .select({ id: modifierGroups.id })
        .from(modifierGroups)
        .where(and(inArray(modifierGroups.id, ids), eq(modifierGroups.branchId, branchId)));
      if (groups.length !== ids.length) throw new MenuError("Option group not found.");
    }
    const before = await tx
      .select({ groupId: productModifierGroups.groupId })
      .from(productModifierGroups)
      .where(eq(productModifierGroups.productId, productId))
      .orderBy(asc(productModifierGroups.sortOrder));
    await tx.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId));
    if (ids.length > 0) {
      await tx.insert(productModifierGroups).values(ids.map((groupId, sortOrder) => ({ productId, groupId, sortOrder })));
    }
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "PRODUCT_MODIFIER_GROUPS_CHANGED",
      entityType: "product",
      entityId: productId,
      before: { groupIds: before.map((r) => r.groupId) },
      after: { groupIds: ids },
    });
  });
}
