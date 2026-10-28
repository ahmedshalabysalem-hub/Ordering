import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { authAccounts, authSessions, userRoles, users } from "@/server/db/schema";

// Staff accounts (ADM-001, SPEC §14.4, ADR-017). Passwords are hashed with the auth library and never
// read back; audit entries never contain them. The branch always keeps at least one active admin.

export class UserAdminError extends Error {}

/** Roles an admin can give in the MVP. CAPTAIN has no login yet (ADR-008). */
export const ASSIGNABLE_ROLES = ["ADMIN", "CASHIER", "KITCHEN"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const password = z.string().min(10, "Use at least 10 characters for the password.").max(128);

export const newUserInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(ASSIGNABLE_ROLES),
  password,
});

export const userUpdateInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  role: z.enum(ASSIGNABLE_ROLES),
  isActive: z.boolean(),
});

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
};

// Serialises changes that could remove the last admin (any constant works).
const ADMIN_GUARD_LOCK = 4_206_017;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listUsers(staff: StaffUser): Promise<AdminUserRow[]> {
  const branchId = branchFor(staff, "users.manage");
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: userRoles.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.branchId, branchId)))
    .orderBy(asc(users.name));
}

export async function getUser(staff: StaffUser, id: string): Promise<AdminUserRow | null> {
  return (await listUsers(staff)).find((u) => u.id === id) ?? null;
}

const revokeSessions = (tx: Tx, userId: string) => tx.delete(authSessions).where(eq(authSessions.userId, userId));

export async function createUser(staff: StaffUser, raw: z.input<typeof newUserInput>): Promise<{ id: string }> {
  const branchId = branchFor(staff, "users.manage");
  const input = newUserInput.parse(raw);
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (taken) throw new UserAdminError("A user with this email already exists.");
    const id = uuidv7();
    await tx.insert(users).values({ id, name: input.name, email: input.email, emailVerified: true });
    await tx.insert(authAccounts).values({ id: uuidv7(), userId: id, accountId: id, providerId: "credential", password: hash });
    await tx.insert(userRoles).values({ userId: id, branchId, role: input.role });
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: id,
      after: { name: input.name, email: input.email, role: input.role },
    });
    return { id };
  });
}

async function activeAdminsOtherThan(tx: Tx, branchId: string, userId: string): Promise<number> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.branchId, branchId), eq(userRoles.role, "ADMIN"), eq(users.isActive, true), ne(users.id, userId)));
  return count;
}

export async function updateUser(staff: StaffUser, id: string, raw: z.input<typeof userUpdateInput>): Promise<void> {
  const branchId = branchFor(staff, "users.manage");
  const input = userUpdateInput.parse(raw);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);
    const [before] = await tx
      .select({ name: users.name, isActive: users.isActive, role: userRoles.role })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.branchId, branchId)))
      .where(eq(users.id, id))
      .for("update", { of: users });
    if (!before) throw new UserAdminError("User not found.");
    const losesAdmin = before.role === "ADMIN" && before.isActive && (input.role !== "ADMIN" || !input.isActive);
    if (losesAdmin) {
      if (id === staff.id) throw new UserAdminError("You cannot remove your own admin access or deactivate yourself.");
      if ((await activeAdminsOtherThan(tx, branchId, id)) === 0) {
        throw new UserAdminError("This is the last active administrator. Make another user an admin first.");
      }
    }
    await tx.update(users).set({ name: input.name, isActive: input.isActive }).where(eq(users.id, id));
    if (before.role !== input.role) {
      await tx.update(userRoles).set({ role: input.role }).where(and(eq(userRoles.userId, id), eq(userRoles.branchId, branchId)));
    }
    if (before.isActive && !input.isActive) await revokeSessions(tx, id);
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: before.role !== input.role ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      entityType: "user",
      entityId: id,
      before,
      after: input,
    });
  });
}

/**
 * Sets a new password chosen by the admin and handed to the user in person (ADR-017). It also
 * clears a lockout and signs the user out everywhere.
 */
export async function resetPassword(staff: StaffUser, id: string, newPassword: string): Promise<void> {
  const branchId = branchFor(staff, "users.manage");
  const hash = await hashPassword(password.parse(newPassword));
  await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, id), eq(userRoles.branchId, branchId)));
    if (!member) throw new UserAdminError("User not found.");
    const updated = await tx
      .update(authAccounts)
      .set({ password: hash })
      .where(and(eq(authAccounts.userId, id), eq(authAccounts.providerId, "credential")))
      .returning({ id: authAccounts.id });
    if (updated.length === 0) {
      await tx.insert(authAccounts).values({ id: uuidv7(), userId: id, accountId: id, providerId: "credential", password: hash });
    }
    await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, id));
    await revokeSessions(tx, id);
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "USER_PASSWORD_RESET", entityType: "user", entityId: id });
  });
}
