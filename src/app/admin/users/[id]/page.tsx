import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getUser } from "@/server/admin/users";
import { requirePermission } from "@/server/auth/session";
import { resetPasswordAction, updateUserAction } from "../actions";
import { EditUserForm, ResetPasswordForm } from "../user-forms";

export const metadata: Metadata = { title: "Edit user" };

export default function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <Link href="/admin/users" className="text-sm underline">
        ← All users
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <EditUser params={params} />
      </Suspense>
    </main>
  );
}

async function EditUser({ params }: { params: PageProps<"/admin/users/[id]">["params"] }) {
  const { id } = await params;
  const staff = await requirePermission("users.manage");
  const user = /^[0-9a-f-]{36}$/.test(id) ? await getUser(staff, id) : null;
  if (!user) notFound();
  return (
    <>
      <h1 className="text-2xl font-semibold">{user.name}</h1>
      <p className="text-zinc-600">{user.email}</p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Profile and role</h2>
        <EditUserForm action={updateUserAction.bind(null, user.id)} defaults={user} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Password</h2>
        <p className="text-sm text-zinc-600">Set a new password and hand it to the user in person. This also unlocks the account and signs the user out everywhere.</p>
        <ResetPasswordForm action={resetPasswordAction.bind(null, user.id)} />
      </section>
    </>
  );
}
