import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { can, requireStaff } from "@/server/auth/session";
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
      <nav className="flex flex-wrap justify-center gap-4">
        {(can(staff, "reports.view_operational") || can(staff, "reports.view_all")) && (
          <Link href="/admin" className="underline">
            Admin overview
          </Link>
        )}
        {(can(staff, "orders.history_recent") || can(staff, "orders.history_full")) && (
          <Link href="/admin/orders" className="underline">
            Order history
          </Link>
        )}
        {can(staff, "tables.manage") && (
          <Link href="/admin/tables" className="underline">
            Tables &amp; QR codes
          </Link>
        )}
        {can(staff, "menu.manage") && (
          <Link href="/admin/menu" className="underline">
            Menu
          </Link>
        )}
        {can(staff, "captains.manage") && (
          <Link href="/admin/captains" className="underline">
            Captains
          </Link>
        )}
        {can(staff, "orders.view_operational") && (
          <Link href="/staff/cashier" className="underline">
            Cashier
          </Link>
        )}
        {can(staff, "kitchen.view") && (
          <Link href="/staff/kitchen" className="underline">
            Kitchen
          </Link>
        )}
      </nav>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-zinc-300 px-4 py-2 font-medium">
          Sign out
        </button>
      </form>
    </>
  );
}
