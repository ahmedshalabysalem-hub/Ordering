import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import type { StaffUser } from "@/server/auth/permissions";
import {
  createTable,
  listTables,
  regenerateQrToken,
  resolveQrToken,
  TableError,
  tableOrderUrl,
  updateTable,
} from "@/server/tables/service";
import { sql } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

async function newBranchWith(role: "ADMIN" | "CASHIER"): Promise<StaffUser> {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const userId = uuidv7();
  await sql`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'كافيه', 'Cafe')`;
  await sql`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency)
            values (${branchId}, ${restaurantId}, 'فرع', 'Branch', 'Africa/Cairo', 'EGP')`;
  await sql`insert into users (id, name, email) values (${userId}, 'Staff', ${`staff-${userId}@example.com`})`;
  await sql`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branchId}, ${role})`;
  return { id: userId, name: "Staff", email: "s@example.com", roles: [{ branchId, role }] };
}

describe("tables and permanent QR tokens (TBL-001, ADR-004)", () => {
  it("creates a table with a random token and an audit entry", async () => {
    const admin = await newBranchWith("ADMIN");
    const table = await createTable(admin, { number: 12, name: "Window", section: "Terrace" });
    expect(table.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(tableOrderUrl("https://cafe.example", table.qrToken)).toBe(`https://cafe.example/order/table/${table.qrToken}`);
    const [audit] = await sql`select action, actor_user_id from audit_logs where entity_id = ${table.id}`;
    expect(audit).toEqual({ action: "TABLE_CREATED", actor_user_id: admin.id });
    expect((await listTables(admin)).map((t) => t.number)).toEqual([12]);
  });

  it("rejects a duplicate table number with a clear error", async () => {
    const admin = await newBranchWith("ADMIN");
    await createTable(admin, { number: 3 });
    await expect(createTable(admin, { number: 3 })).rejects.toThrow(new TableError("Table 3 already exists."));
    const second = await createTable(admin, { number: 4 });
    await expect(updateTable(admin, second.id, { number: 3 })).rejects.toThrow(TableError);
  });

  it("keeps the same QR token when the table is renamed, renumbered or deactivated", async () => {
    const admin = await newBranchWith("ADMIN");
    const table = await createTable(admin, { number: 7 });
    const edited = await updateTable(admin, table.id, { number: 70, name: "VIP", isActive: false });
    expect(edited.qrToken).toBe(table.qrToken);
    expect(edited.number).toBe(70);
    expect(await resolveQrToken(table.qrToken)).toMatchObject({ status: "inactive", number: 70 });
    await updateTable(admin, table.id, { number: 70, isActive: true });
    expect(await resolveQrToken(table.qrToken)).toMatchObject({ status: "active", number: 70, restaurantNameEn: "Cafe" });
  });

  it("regenerates the token only on request: the old code stops working and the reason is audited", async () => {
    const admin = await newBranchWith("ADMIN");
    const table = await createTable(admin, { number: 9 });
    const rotated = await regenerateQrToken(admin, table.id, "Card was stolen");
    expect(rotated.qrToken).not.toBe(table.qrToken);
    expect(await resolveQrToken(table.qrToken)).toEqual({ status: "not_found" });
    expect(await resolveQrToken(rotated.qrToken)).toMatchObject({ status: "active", number: 9 });
    const [audit] = await sql`select reason, after from audit_logs where entity_id = ${table.id} and action = 'TABLE_QR_REGENERATED'`;
    expect(audit.reason).toBe("Card was stolen");
    expect(JSON.stringify(audit)).not.toContain(rotated.qrToken);
  });

  it("refuses non-admins and other branches", async () => {
    const admin = await newBranchWith("ADMIN");
    const cashier = await newBranchWith("CASHIER");
    await expect(createTable(cashier, { number: 1 })).rejects.toMatchObject({ status: 403 });
    const table = await createTable(admin, { number: 1 });
    await expect(regenerateQrToken(cashier, table.id, "nope")).rejects.toMatchObject({ status: 403 });
    const otherAdmin = await newBranchWith("ADMIN");
    await expect(updateTable(otherAdmin, table.id, { number: 2 })).rejects.toThrow("Table not found.");
  });

  it("does not resolve malformed or unknown tokens", async () => {
    expect(await resolveQrToken("12")).toEqual({ status: "not_found" });
    expect(await resolveQrToken("x".repeat(32))).toEqual({ status: "not_found" });
  });
});
