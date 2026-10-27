import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/server/db/client";
import { auth } from "./auth";
import { AuthError, assertCan, can, type Permission, type Role, type StaffUser } from "./permissions";

export { AuthError, assertCan, can, type Role, type StaffUser };

/** Loads an active staff member and their roles by user id, or null. */
export async function loadStaff(userId: string): Promise<StaffUser | null> {
  const [user] = await sql<{ id: string; name: string; email: string; is_active: boolean }[]>`
    select id, name, email, is_active from users where id = ${userId}`;
  if (!user || !user.is_active) return null;
  const roles = await sql<{ branch_id: string; role: Role }[]>`
    select branch_id, role from user_roles where user_id = ${user.id} order by role`;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: roles.map((r) => ({ branchId: r.branch_id, role: r.role })),
  };
}

/** The signed-in, active staff member with their roles, or null. */
export async function getCurrentStaff(): Promise<StaffUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? loadStaff(session.user.id) : null;
}

/** For server actions and route handlers: the current staff member, or AuthError (401/403). */
export async function authorize(permission: Permission, branchId?: string): Promise<StaffUser> {
  return assertCan(await getCurrentStaff(), permission, branchId);
}

/** For staff pages: redirects to /login when signed out. */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** For staff pages: redirects to /login when signed out and to /forbidden without the permission. */
export async function requirePermission(permission: Permission, branchId?: string): Promise<StaffUser> {
  const staff = await requireStaff();
  if (!can(staff, permission, branchId)) redirect("/forbidden");
  return staff;
}

/** Converts AuthError into a JSON response for route handlers; rethrows anything else. */
export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
  throw e;
}
