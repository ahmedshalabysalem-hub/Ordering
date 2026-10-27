import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AuthError, type Role, type StaffUser } from "@/server/auth/permissions";
import {
  addModifierOption,
  createModifierGroup,
  getProductModifierGroupIds,
  listModifierGroups,
  setProductModifierGroups,
  updateModifierGroup,
  updateModifierOption,
} from "@/server/menu/modifiers";
import { createCategory, createProduct, MenuError } from "@/server/menu/service";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function newBranch() {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency)
            values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  return branchId;
}

async function staffIn(branchId: string, role: Role): Promise<StaffUser> {
  const userId = uuidv7();
  await sql`insert into users (id, name, email) values (${userId}, 'Staff', ${`staff-${userId}@example.com`})`;
  await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
  return { id: userId, name: "Staff", email: "s@example.com", roles: [{ branchId, role }] };
}

async function latteFor(admin: StaffUser) {
  const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
  return createProduct(admin, { categoryId: drinks.id, nameAr: "لاتيه", nameEn: "Latte", price: "45" });
}

describe("modifier groups and options (MENU-002)", () => {
  it("creates groups with options and exact extra prices", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const size = await createModifierGroup(admin, { nameAr: "الحجم", nameEn: "Size", minSelect: 1, maxSelect: 1 });
    await addModifierOption(admin, size.id, { nameAr: "كبير", nameEn: "Large", priceDelta: "10.50", sortOrder: 2 });
    await addModifierOption(admin, size.id, { nameAr: "صغير", nameEn: "Small", sortOrder: 1 });
    const [group] = await listModifierGroups(admin);
    expect(group.options.map((o) => [o.nameEn, o.priceDeltaMinor])).toEqual([
      ["Small", 0],
      ["Large", 1050],
    ]);
  });

  it("rejects an impossible selection rule", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    await expect(createModifierGroup(admin, { nameAr: "x", nameEn: "x", minSelect: 3, maxSelect: 2 })).rejects.toThrow("Maximum must be");
    await expect(createModifierGroup(admin, { nameAr: "x", nameEn: "x", minSelect: 0, maxSelect: 0 })).rejects.toThrow("Maximum must be");
  });

  it("audits option price changes separately", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const extras = await createModifierGroup(admin, { nameAr: "إضافات", nameEn: "Extras", maxSelect: 3 });
    const shot = await addModifierOption(admin, extras.id, { nameAr: "شوت", nameEn: "Shot", priceDelta: "7.5" });
    await updateModifierOption(admin, shot.id, { nameAr: "شوت", nameEn: "Extra shot", priceDelta: "7.50" });
    await updateModifierOption(admin, shot.id, { nameAr: "شوت", nameEn: "Extra shot", priceDelta: "9" });
    const actions = await sql`select action from audit_logs where entity_id = ${shot.id} order by created_at, id`;
    expect(actions.map((a) => a.action)).toEqual(["MODIFIER_OPTION_CREATED", "MODIFIER_OPTION_UPDATED", "MODIFIER_OPTION_PRICE_CHANGED"]);
  });

  it("links groups to a product in order and replaces the links on save", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const latte = await latteFor(admin);
    const size = await createModifierGroup(admin, { nameAr: "الحجم", nameEn: "Size", minSelect: 1 });
    const extras = await createModifierGroup(admin, { nameAr: "إضافات", nameEn: "Extras", maxSelect: 3 });
    await setProductModifierGroups(admin, latte.id, [size.id, extras.id]);
    expect(await getProductModifierGroupIds(admin, latte.id)).toEqual([size.id, extras.id]);
    await setProductModifierGroups(admin, latte.id, [extras.id]);
    expect(await getProductModifierGroupIds(admin, latte.id)).toEqual([extras.id]);
    const [entry] = await sql`select before, after from audit_logs
                              where entity_id = ${latte.id} and action = 'PRODUCT_MODIFIER_GROUPS_CHANGED'
                              order by created_at desc, id desc limit 1`;
    expect(entry).toEqual({ before: { groupIds: [size.id, extras.id] }, after: { groupIds: [extras.id] } });
  });

  it("keeps each branch's groups and options to itself", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const other = await staffIn(await newBranch(), "ADMIN");
    const latte = await latteFor(admin);
    const foreign = await createModifierGroup(other, { nameAr: "غريب", nameEn: "Foreign" });
    const foreignOption = await addModifierOption(other, foreign.id, { nameAr: "س", nameEn: "X" });
    await expect(setProductModifierGroups(admin, latte.id, [foreign.id])).rejects.toThrow(MenuError);
    await expect(addModifierOption(admin, foreign.id, { nameAr: "س", nameEn: "X" })).rejects.toThrow("Option group not found.");
    await expect(updateModifierOption(admin, foreignOption.id, { nameAr: "س", nameEn: "Y" })).rejects.toThrow("Option not found.");
    await expect(updateModifierGroup(admin, foreign.id, { nameAr: "س", nameEn: "Y" })).rejects.toThrow("Option group not found.");
  });

  it("is admin-only (ADR-008)", async () => {
    const cashier = await staffIn(await newBranch(), "CASHIER");
    await expect(createModifierGroup(cashier, { nameAr: "x", nameEn: "x" })).rejects.toThrow(AuthError);
  });
});
