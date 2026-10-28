import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listUsers } from "@/server/admin/users";
import { requirePermission } from "@/server/auth/session";
import { createUserAction } from "./actions";
import { NewUserForm } from "./user-forms";

export const metadata: Metadata = { title: "Users & roles" };

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Users />
      </Suspense>
    </main>
  );
}

async function Users() {
  const staff = await requirePermission("users.manage");
  const users = await listUsers(staff);
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "Never");
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a user</h2>
        <NewUserForm action={createUserAction} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">All users ({users.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-zinc-600">
              <th className="py-2 text-start">Name</th>
              <th className="py-2 text-start">Email</th>
              <th className="py-2 text-start">Role</th>
              <th className="py-2 text-start">Status</th>
              <th className="py-2 text-start">Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2 font-medium">{u.name}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">{!u.isActive ? "Inactive" : u.lockedUntil && u.lockedUntil > new Date() ? "Locked" : "Active"}</td>
                <td className="py-2">{fmt(u.lastLoginAt)}</td>
                <td className="py-2 text-end">
                  <Link href={`/admin/users/${u.id}`} className="underline">
                    Edit {u.name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
