import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, permissionsFor } from "@/server/auth/permissions";
import { AuthError, assertCan, can, type StaffUser } from "@/server/auth/permissions";

const staff = (...roles: StaffUser["roles"]): StaffUser => ({ id: "u", name: "U", email: "u@example.com", roles });

describe("permission matrix (ADR-008)", () => {
  it("gives admins every management permission", () => {
    for (const p of ["menu.manage", "users.manage", "roles.assign", "payments.refund", "qr.regenerate"] as const) {
      expect(hasPermission(["ADMIN"], p)).toBe(true);
    }
  });

  it("keeps kitchen staff away from prices, accounts and money (Scenario F)", () => {
    for (const p of ["menu.manage", "users.manage", "roles.assign", "payments.record", "session.close"] as const) {
      expect(hasPermission(["KITCHEN"], p)).toBe(false);
    }
    expect(hasPermission(["KITCHEN"], "kitchen.transition")).toBe(true);
    expect(hasPermission(["KITCHEN"], "product.toggle_availability")).toBe(true);
  });

  it("lets cashiers run the floor but not administer (Scenario F)", () => {
    for (const p of ["users.manage", "roles.assign", "settings.manage", "menu.manage", "payments.refund"] as const) {
      expect(hasPermission(["CASHIER"], p)).toBe(false);
    }
    for (const p of ["payments.record", "captain.assign", "session.close", "assistance.handle"] as const) {
      expect(hasPermission(["CASHIER"], p)).toBe(true);
    }
    expect(hasPermission(["CASHIER"], "orders.cancel_before_preparation")).toBe(true);
    expect(hasPermission(["CASHIER"], "orders.cancel_after_preparation")).toBe(false);
  });

  it("never lets captains touch money or settings", () => {
    const captain = permissionsFor(["CAPTAIN"]);
    expect([...captain].some((p) => p.startsWith("payments.") || p.endsWith(".manage"))).toBe(false);
  });

  it("grants nothing without a role", () => {
    for (const p of PERMISSIONS) expect(hasPermission([], p)).toBe(false);
  });

  it("combines permissions across roles", () => {
    expect(permissionsFor(["CASHIER", "KITCHEN"]).has("kitchen.transition")).toBe(true);
    expect(permissionsFor(["CASHIER", "KITCHEN"]).has("payments.record")).toBe(true);
  });
});

describe("guards", () => {
  it("scopes checks to a branch when one is given", () => {
    const s = staff({ branchId: "b1", role: "ADMIN" }, { branchId: "b2", role: "KITCHEN" });
    expect(can(s, "menu.manage")).toBe(true);
    expect(can(s, "menu.manage", "b1")).toBe(true);
    expect(can(s, "menu.manage", "b2")).toBe(false);
  });

  it("throws 401 when signed out and 403 without the permission", () => {
    expect(() => assertCan(null, "menu.manage")).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => assertCan(staff({ branchId: "b", role: "KITCHEN" }), "menu.manage")).toThrow(AuthError);
    expect(() => assertCan(staff({ branchId: "b", role: "KITCHEN" }), "menu.manage")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(assertCan(staff({ branchId: "b", role: "ADMIN" }), "menu.manage").id).toBe("u");
  });
});
