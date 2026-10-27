import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { AuthError, type Role, type StaffUser } from "@/server/auth/permissions";
import { readImage } from "@/server/media/storage";
import {
  createCategory,
  createProduct,
  getMenuOverview,
  MenuError,
  setProductAvailability,
  updateCategory,
  updateProduct,
} from "@/server/menu/service";
import { MoneyError } from "@/server/money";
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

const latte = (categoryId: string, price = "45.50") => ({ categoryId, nameAr: "لاتيه", nameEn: "Latte", price });
const auditActions = async (entityId: string) =>
  (await sql`select action from audit_logs where entity_id = ${entityId} order by created_at, id`).map((r) => r.action);

// Smallest valid PNG header plus padding; the server checks the signature, not the pixels.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);

describe("menu categories and products (MENU-001, ADR-011)", () => {
  it("creates categories and products with exact prices and audit entries", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks", sortOrder: 2 });
    const food = await createCategory(admin, { nameAr: "أكل", nameEn: "Food", sortOrder: 1 });
    const product = await createProduct(admin, { ...latte(drinks.id, "19.99"), sku: "LAT-1", prepMinutes: "4" });
    expect(product).toMatchObject({ priceMinor: 1999, sku: "LAT-1", prepMinutes: 4, isAvailable: true, isActive: true });

    const overview = await getMenuOverview(admin);
    expect(overview.currency).toBe("EGP");
    expect(overview.categories.map((c) => [c.nameEn, c.products.length])).toEqual([
      ["Food", 0],
      ["Drinks", 1],
    ]);
    expect(await auditActions(drinks.id)).toEqual(["CATEGORY_CREATED"]);
    expect(await auditActions(product.id)).toEqual(["PRODUCT_CREATED"]);
    void food;
  });

  it("records a price change separately and keeps the old price in the audit log", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
    const product = await createProduct(admin, latte(drinks.id));
    await updateProduct(admin, product.id, { ...latte(drinks.id), descriptionEn: "With oat milk" });
    const updated = await updateProduct(admin, product.id, latte(drinks.id, "52"));
    expect(updated.priceMinor).toBe(5200);
    expect(await auditActions(product.id)).toEqual(["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_PRICE_CHANGED"]);
    const [entry] = await sql`select before, after from audit_logs where entity_id = ${product.id} and action = 'PRODUCT_PRICE_CHANGED'`;
    expect([entry.before.priceMinor, entry.after.priceMinor]).toEqual([4550, 5200]);
  });

  it("rejects bad prices, foreign categories and duplicate SKUs", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const otherAdmin = await staffIn(await newBranch(), "ADMIN");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
    const foreign = await createCategory(otherAdmin, { nameAr: "غريب", nameEn: "Foreign" });

    await expect(createProduct(admin, latte(drinks.id, "45.555"))).rejects.toThrow(MoneyError);
    await expect(createProduct(admin, latte(drinks.id, "-1"))).rejects.toThrow(MoneyError);
    await expect(createProduct(admin, latte(foreign.id))).rejects.toThrow(new MenuError("Choose a category."));

    await createProduct(admin, { ...latte(drinks.id), sku: "LAT" });
    await expect(createProduct(admin, { ...latte(drinks.id), sku: "LAT" })).rejects.toThrow("SKU LAT is already used");
    // The same SKU in another branch is fine.
    await createProduct(otherAdmin, { ...latte(foreign.id), sku: "LAT" });
  });

  it("deactivates instead of deleting and never lets one branch edit another's menu", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const intruder = await staffIn(await newBranch(), "ADMIN");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
    const hidden = await updateCategory(admin, drinks.id, { nameAr: "مشروبات", nameEn: "Drinks", isActive: false });
    expect(hidden.isActive).toBe(false);
    await expect(updateCategory(intruder, drinks.id, { nameAr: "x", nameEn: "x" })).rejects.toThrow("Category not found.");
  });

  it("lets kitchen and cashier staff mark products sold out but not edit the menu (ADR-008)", async () => {
    const branchId = await newBranch();
    const admin = await staffIn(branchId, "ADMIN");
    const kitchen = await staffIn(branchId, "KITCHEN");
    const cashier = await staffIn(branchId, "CASHIER");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
    const product = await createProduct(admin, latte(drinks.id));

    expect((await setProductAvailability(kitchen, product.id, false)).isAvailable).toBe(false);
    expect((await setProductAvailability(cashier, product.id, true)).isAvailable).toBe(true);
    // Setting the same value again is not a change and is not audited.
    await setProductAvailability(cashier, product.id, true);
    expect(await auditActions(product.id)).toEqual(["PRODUCT_CREATED", "PRODUCT_AVAILABILITY_CHANGED", "PRODUCT_AVAILABILITY_CHANGED"]);

    await expect(createCategory(kitchen, { nameAr: "x", nameEn: "x" })).rejects.toThrow(AuthError);
    await expect(updateProduct(cashier, product.id, latte(drinks.id, "1"))).rejects.toThrow(AuthError);
  });

  it("stores a validated image, keeps it on edit and removes it on request", async () => {
    const admin = await staffIn(await newBranch(), "ADMIN");
    const drinks = await createCategory(admin, { nameAr: "مشروبات", nameEn: "Drinks" });
    const product = await createProduct(admin, latte(drinks.id), { upload: PNG });
    expect(product.imageUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
    const stored = await readImage(product.imageUrl!.split("/").pop()!);
    expect(stored?.contentType).toBe("image/png");
    expect(stored?.bytes.equals(Buffer.from(PNG))).toBe(true);

    expect((await updateProduct(admin, product.id, latte(drinks.id))).imageUrl).toBe(product.imageUrl);
    expect((await updateProduct(admin, product.id, latte(drinks.id), { remove: true })).imageUrl).toBeNull();
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    await expect(updateProduct(admin, product.id, latte(drinks.id), { upload: svg })).rejects.toThrow("JPEG, PNG or WebP");
  });
});
