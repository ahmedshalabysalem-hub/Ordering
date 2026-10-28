import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  branches,
  branchSettings,
  menuCategories,
  modifierGroups,
  modifierOptions,
  productModifierGroups,
  products,
  restaurants,
  taxRates,
} from "@/server/db/schema";

// The public menu for the customer page (UI-001, ADR-013). Only what a customer needs: no SKU, prep
// station or other internal fields. Read fresh on each load so admin changes show at once.

export type PublicOption = { id: string; nameAr: string; nameEn: string; priceDeltaMinor: number; isAvailable: boolean };
export type PublicGroup = { id: string; nameAr: string; nameEn: string; minSelect: number; maxSelect: number; options: PublicOption[] };
export type PublicProduct = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  priceMinor: number;
  isAvailable: boolean;
  groups: PublicGroup[];
};
export type PublicCategory = { id: string; nameAr: string; nameEn: string; products: PublicProduct[] };

export type PublicMenu = {
  restaurant: { nameAr: string; nameEn: string; logoUrl: string | null };
  currency: string;
  defaultLanguage: "ar" | "en";
  pricesIncludeTax: boolean;
  hasTax: boolean;
  serviceChargeBps: number;
  categories: PublicCategory[];
};

export async function getPublicMenu(branchId: string): Promise<PublicMenu> {
  const [[branch], categoryRows, productRows, taxRows] = await Promise.all([
    db
      .select({
        currency: branches.currency,
        defaultLanguage: branches.defaultLanguage,
        nameAr: restaurants.nameAr,
        nameEn: restaurants.nameEn,
        logoUrl: restaurants.logoUrl,
        pricesIncludeTax: branchSettings.pricesIncludeTax,
        serviceChargeBps: branchSettings.serviceChargeBps,
      })
      .from(branches)
      .innerJoin(restaurants, eq(restaurants.id, branches.restaurantId))
      .leftJoin(branchSettings, eq(branchSettings.branchId, branches.id))
      .where(eq(branches.id, branchId)),
    db
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.branchId, branchId), eq(menuCategories.isActive, true)))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.nameEn)),
    db
      .select()
      .from(products)
      .where(and(eq(products.branchId, branchId), eq(products.isActive, true)))
      .orderBy(asc(products.sortOrder), asc(products.nameEn)),
    db
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(and(eq(taxRates.branchId, branchId), eq(taxRates.isActive, true))),
  ]);
  if (!branch) throw new Error(`Branch ${branchId} not found.`);

  const productIds = productRows.map((p) => p.id);
  const links = productIds.length
    ? await db
        .select({ productId: productModifierGroups.productId, group: modifierGroups })
        .from(productModifierGroups)
        .innerJoin(modifierGroups, eq(modifierGroups.id, productModifierGroups.groupId))
        .where(and(inArray(productModifierGroups.productId, productIds), eq(modifierGroups.isActive, true)))
        .orderBy(asc(productModifierGroups.sortOrder))
    : [];
  const groupIds = [...new Set(links.map((l) => l.group.id))];
  const optionRows = groupIds.length
    ? await db
        .select()
        .from(modifierOptions)
        .where(inArray(modifierOptions.groupId, groupIds))
        .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.nameEn))
    : [];

  const groupsFor = (productId: string): PublicGroup[] =>
    links
      .filter((l) => l.productId === productId)
      .map(({ group }) => ({
        id: group.id,
        nameAr: group.nameAr,
        nameEn: group.nameEn,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: optionRows
          .filter((o) => o.groupId === group.id)
          .map((o) => ({ id: o.id, nameAr: o.nameAr, nameEn: o.nameEn, priceDeltaMinor: o.priceDeltaMinor, isAvailable: o.isAvailable })),
      }));

  const categories = categoryRows
    .map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      products: productRows
        .filter((p) => p.categoryId === c.id)
        .map((p) => ({
          id: p.id,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          descriptionAr: p.descriptionAr,
          descriptionEn: p.descriptionEn,
          imageUrl: p.imageUrl,
          priceMinor: p.priceMinor,
          isAvailable: p.isAvailable,
          groups: groupsFor(p.id),
        })),
    }))
    .filter((c) => c.products.length > 0);

  return {
    restaurant: { nameAr: branch.nameAr, nameEn: branch.nameEn, logoUrl: branch.logoUrl },
    currency: branch.currency,
    defaultLanguage: branch.defaultLanguage === "en" ? "en" : "ar",
    pricesIncludeTax: branch.pricesIncludeTax ?? false,
    hasTax: taxRows.length > 0,
    serviceChargeBps: branch.serviceChargeBps ?? 0,
    categories,
  };
}
