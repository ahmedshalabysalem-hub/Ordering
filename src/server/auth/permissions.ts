import type { ROLES } from "@/server/db/schema";

// Role → permission map from ADR-008 (docs/architecture/STATE_MACHINES.md §7).
// Scope limits noted there ("assigned only", "last 7 days") are enforced by the features themselves.

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "tables.manage",
  "qr.regenerate",
  "menu.manage",
  "product.toggle_availability",
  "users.manage",
  "roles.assign",
  "captains.manage",
  "chefs.manage",
  "suppliers.manage",
  "settings.manage",
  "audit.view",
  "orders.view_operational",
  "kitchen.view",
  "kitchen.transition",
  "orders.cancel_before_preparation",
  "orders.cancel_after_preparation",
  "captain.assign",
  "delivery.confirm",
  "payments.record",
  "payments.refund",
  "session.close",
  "assistance.handle",
  "orders.history_full",
  "orders.history_recent",
  "kitchen.history_today",
  "reports.view_all",
  "reports.view_operational",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS.filter((p) => p !== "orders.history_recent" && p !== "kitchen.history_today"),
  CASHIER: [
    "product.toggle_availability",
    "orders.view_operational",
    "orders.cancel_before_preparation",
    "captain.assign",
    "delivery.confirm",
    "payments.record",
    "session.close",
    "assistance.handle",
    "orders.history_recent",
    "reports.view_operational",
  ],
  KITCHEN: ["product.toggle_availability", "kitchen.view", "kitchen.transition", "kitchen.history_today"],
  // No captain login in the MVP; these apply once the captain interface exists (assigned orders only).
  CAPTAIN: ["orders.view_operational", "delivery.confirm", "assistance.handle"],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r].includes(permission));
}

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  roles: { branchId: string; role: Role }[];
};

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message = status === 401 ? "Sign in required." : "You do not have permission to do this.",
  ) {
    super(message);
  }
}

/** True when the staff member holds `permission`, in `branchId` if given, otherwise in any branch. */
export function can(staff: StaffUser, permission: Permission, branchId?: string): boolean {
  const roles = staff.roles.filter((r) => !branchId || r.branchId === branchId).map((r) => r.role);
  return hasPermission(roles, permission);
}

/** Throws AuthError unless `staff` is present and holds `permission`. */
export function assertCan(staff: StaffUser | null, permission: Permission, branchId?: string): StaffUser {
  if (!staff) throw new AuthError(401);
  if (!can(staff, permission, branchId)) throw new AuthError(403);
  return staff;
}

/**
 * The branch where `staff` holds `permission` (the MVP has one branch per staff member).
 * Throws AuthError like assertCan when there is none.
 */
export function branchFor(staff: StaffUser | null, permission: Permission): string {
  if (!staff) throw new AuthError(401);
  const role = staff.roles.find((r) => hasPermission([r.role], permission));
  if (!role) throw new AuthError(403);
  return role.branchId;
}
