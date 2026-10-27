import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/server/db/client";
import type { ROLES } from "@/server/db/schema";
import { auth } from "./auth";

export type Role = (typeof ROLES)[number];

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  roles: { branchId: string; role: Role }[];
};

/** The signed-in, active staff member with their roles, or null. */
export async function getCurrentStaff(): Promise<StaffUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [user] = await sql<{ id: string; name: string; email: string; is_active: boolean }[]>`
    select id, name, email, is_active from users where id = ${session.user.id}`;
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

/** For staff pages: redirects to /login when nobody is signed in. Role checks come with AUTH-002. */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}
