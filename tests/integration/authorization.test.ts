import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { assertCan, loadStaff } from "@/server/auth/session";
import { seedBase, sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function addUser(branchId: string, role: string, active = true) {
  const id = uuidv7();
  await sql`insert into users (id, name, email, is_active) values (${id}, ${role}, ${`${role}-${id}@example.com`}, ${active})`;
  await sql`insert into user_roles (user_id, branch_id, role) values (${id}, ${branchId}, ${role})`;
  return id;
}

describe("server-side authorization with real roles", () => {
  it("enforces the ADR-008 matrix for users loaded from the database (Scenario F)", async () => {
    const { branchId } = await seedBase(sql, 41);
    const kitchen = await loadStaff(await addUser(branchId, "KITCHEN"));
    const cashier = await loadStaff(await addUser(branchId, "CASHIER"));
    const admin = await loadStaff(await addUser(branchId, "ADMIN"));

    expect(() => assertCan(kitchen, "menu.manage", branchId)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertCan(cashier, "users.manage", branchId)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertCan(cashier, "roles.assign", branchId)).toThrow(expect.objectContaining({ status: 403 }));
    expect(assertCan(cashier, "payments.record", branchId).id).toBe(cashier!.id);
    expect(assertCan(admin, "roles.assign", branchId).id).toBe(admin!.id);
  });

  it("treats deactivated and unknown users as signed out", async () => {
    const { branchId } = await seedBase(sql, 42);
    const inactive = await loadStaff(await addUser(branchId, "ADMIN", false));
    expect(inactive).toBeNull();
    expect(() => assertCan(inactive, "menu.manage")).toThrow(expect.objectContaining({ status: 401 }));
    expect(await loadStaff(uuidv7())).toBeNull();
  });
});
