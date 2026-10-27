import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/server/auth/session";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: "Staff" };

export default function StaffHome() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <SignedInStaff />
      </Suspense>
    </main>
  );
}

async function SignedInStaff() {
  const staff = await requireStaff();
  return (
    <>
      <h1 className="text-2xl font-semibold">Signed in as {staff.name}</h1>
      <p className="text-zinc-600">
        {staff.email} · {staff.roles.map((r) => r.role).join(", ") || "no role assigned"}
      </p>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-zinc-300 px-4 py-2 font-medium">
          Sign out
        </button>
      </form>
    </>
  );
}
