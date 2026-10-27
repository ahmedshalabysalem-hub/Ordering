import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { branches, menuCategories, products } from "@/server/db/schema";
import { saveImage } from "@/server/media/storage";
import { parseMoney } from "@/server/money";

// Menu categories and products (MENU-001, ADR-011). Nothing is deleted: inactive rows are hidden from
// customers and kept for order history. Every change is audited.

export class MenuError extends Error {}

const name = z.string().trim().min(1).max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const sortOrder = z.coerce.number().int().min(0).max(9999).default(0);

export const categoryInput = z.object({
  nameAr: name,
  nameEn: name,
  sortOrder,
  isActive: z.boolean().default(true),
});

export const productInput = z.object({
  categoryId: z.uuid(),
  nameAr: name,
  nameEn: name,
  descriptionAr: optionalText(500),
  descriptionEn: optionalText(500),
  price: z.string(),
  sku: optionalText(40),
  sortOrder,
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  prepStation: optionalText(40),
  prepMinutes: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(240)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export type CategoryInput = z.input<typeof categoryInput>;
export type ProductInput = z.input<typeof productInput>;
export type CategoryRow = typeof menuCategories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;

/** Optional image changes on a product form: a new upload, or removing the current image. */
export type ImageChange = { upload?: Uint8Array; remove?: boolean };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueViolation(e: unknown, constraint: string) {
  const err = (e as { cause?: { code?: string; constraint_name?: string } }).cause ?? (e as { code?: string; constraint_name?: string });
  return err?.code === "23505" && err.constraint_name === constraint;
}

async function branchCurrency(branchId: string): Promise<string> {
  const [row] = await db.select({ currency: branches.currency }).from(branches).where(eq(branches.id, branchId));
  if (!row) throw new MenuError("Branch not found.");
  return row.currency;
}

const categorySnapshot = (c: CategoryRow) => ({ nameAr: c.nameAr, nameEn: c.nameEn, sortOrder: c.sortOrder, isActive: c.isActive });

const productSnapshot = (p: ProductRow) => ({
  categoryId: p.categoryId,
  nameAr: p.nameAr,
  nameEn: p.nameEn,
  descriptionAr: p.descriptionAr,
  descriptionEn: p.descriptionEn,
  imageUrl: p.imageUrl,
  priceMinor: p.priceMinor,
  sku: p.sku,
  sortOrder: p.sortOrder,
  isAvailable: p.isAvailable,
  isActive: p.isActive,
  prepStation: p.prepStation,
  prepMinutes: p.prepMinutes,
});

export type MenuOverview = {
  currency: string;
  categories: (CategoryRow & { products: ProductRow[] })[];
};

/** Admin view: every category and product in the branch, active or not, in display order. */
export async function getMenuOverview(staff: StaffUser): Promise<MenuOverview> {
  const branchId = branchFor(staff, "menu.manage");
  const [currency, categories, productRows] = await Promise.all([
    branchCurrency(branchId),
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.branchId, branchId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.nameEn)),
    db.select().from(products).where(eq(products.branchId, branchId)).orderBy(asc(products.sortOrder), asc(products.nameEn)),
  ]);
  return {
    currency,
    categories: categories.map((c) => ({ ...c, products: productRows.filter((p) => p.categoryId === c.id) })),
  };
}

export async function getCategory(staff: StaffUser, id: string): Promise<CategoryRow | null> {
  const branchId = branchFor(staff, "menu.manage");
  const [row] = await db
    .select()
    .from(menuCategories)
    .where(and(eq(menuCategories.id, id), eq(menuCategories.branchId, branchId)));
  return row ?? null;
}

export async function createCategory(staff: StaffUser, raw: CategoryInput): Promise<CategoryRow> {
  const branchId = branchFor(staff, "menu.manage");
  const input = categoryInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(menuCategories)
      .values({ id: uuidv7(), branchId, ...input })
      .returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "CATEGORY_CREATED",
      entityType: "menu_category",
      entityId: row.id,
      after: categorySnapshot(row),
    });
    return row;
  });
}

export async function updateCategory(staff: StaffUser, id: string, raw: CategoryInput): Promise<CategoryRow> {
  const branchId = branchFor(staff, "menu.manage");
  const input = categoryInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.id, id), eq(menuCategories.branchId, branchId)))
      .for("update");
    if (!before) throw new MenuError("Category not found.");
    const [row] = await tx.update(menuCategories).set(input).where(eq(menuCategories.id, id)).returning();
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "CATEGORY_UPDATED",
      entityType: "menu_category",
      entityId: id,
      before: categorySnapshot(before),
      after: categorySnapshot(row),
    });
    return row;
  });
}

export async function getProduct(staff: StaffUser, id: string): Promise<ProductRow | null> {
  const branchId = branchFor(staff, "menu.manage");
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.branchId, branchId)));
  return row ?? null;
}

async function assertCategoryInBranch(tx: Tx, categoryId: string, branchId: string) {
  const [category] = await tx
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.branchId, branchId)));
  if (!category) throw new MenuError("Choose a category.");
}

async function productValues(branchId: string, raw: ProductInput) {
  const { price, ...input } = productInput.parse(raw);
  return { ...input, priceMinor: parseMoney(price, await branchCurrency(branchId)) };
}

function duplicateSku(e: unknown, sku: string | null): never {
  if (isUniqueViolation(e, "products_branch_sku_uq")) throw new MenuError(`SKU ${sku} is already used by another product.`);
  throw e;
}

export async function createProduct(staff: StaffUser, raw: ProductInput, image: ImageChange = {}): Promise<ProductRow> {
  const branchId = branchFor(staff, "menu.manage");
  const values = await productValues(branchId, raw);
  const imageUrl = image.upload ? await saveImage(image.upload) : null;
  try {
    return await db.transaction(async (tx) => {
      await assertCategoryInBranch(tx, values.categoryId, branchId);
      const [row] = await tx
        .insert(products)
        .values({ id: uuidv7(), branchId, ...values, imageUrl })
        .returning();
      await writeAudit(tx, {
        branchId,
        actorUserId: staff.id,
        action: "PRODUCT_CREATED",
        entityType: "product",
        entityId: row.id,
        after: productSnapshot(row),
      });
      return row;
    });
  } catch (e) {
    duplicateSku(e, values.sku);
  }
}

export async function updateProduct(staff: StaffUser, id: string, raw: ProductInput, image: ImageChange = {}): Promise<ProductRow> {
  const branchId = branchFor(staff, "menu.manage");
  const values = await productValues(branchId, raw);
  const newImageUrl = image.upload ? await saveImage(image.upload) : undefined;
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.branchId, branchId)))
        .for("update");
      if (!before) throw new MenuError("Product not found.");
      await assertCategoryInBranch(tx, values.categoryId, branchId);
      const imageUrl = newImageUrl ?? (image.remove ? null : before.imageUrl);
      const [row] = await tx
        .update(products)
        .set({ ...values, imageUrl })
        .where(eq(products.id, id))
        .returning();
      await writeAudit(tx, {
        branchId,
        actorUserId: staff.id,
        action: before.priceMinor === row.priceMinor ? "PRODUCT_UPDATED" : "PRODUCT_PRICE_CHANGED",
        entityType: "product",
        entityId: id,
        before: productSnapshot(before),
        after: productSnapshot(row),
      });
      return row;
    });
  } catch (e) {
    duplicateSku(e, values.sku);
  }
}

/** Quick sold-out switch. Cashier and kitchen staff may use it too (ADR-008). */
export async function setProductAvailability(staff: StaffUser, id: string, isAvailable: boolean): Promise<ProductRow> {
  const branchId = branchFor(staff, "product.toggle_availability");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.branchId, branchId)))
      .for("update");
    if (!before) throw new MenuError("Product not found.");
    const [row] = await tx.update(products).set({ isAvailable }).where(eq(products.id, id)).returning();
    if (before.isAvailable !== isAvailable) {
      await writeAudit(tx, {
        branchId,
        actorUserId: staff.id,
        action: "PRODUCT_AVAILABILITY_CHANGED",
        entityType: "product",
        entityId: id,
        before: { isAvailable: before.isAvailable },
        after: { isAvailable },
      });
    }
    return row;
  });
}

/** The currency menu prices are entered in (the branch currency). */
export async function getMenuCurrency(staff: StaffUser): Promise<string> {
  return branchCurrency(branchFor(staff, "menu.manage"));
}
