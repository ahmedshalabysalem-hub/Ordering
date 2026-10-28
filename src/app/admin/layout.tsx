import Link from "next/link";
import { Suspense } from "react";
import type { Permission } from "@/server/auth/permissions";
import { can, getCurrentStaff } from "@/server/auth/session";

// Admin shell with a sidebar (SPEC §14). Links show only what the signed-in user may open; every page
// still checks its own permission on the server.

const LINKS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Overview", permission: "reports.view_operational" },
  { href: "/admin/tables", label: "Tables & QR codes", permission: "tables.manage" },
  { href: "/admin/menu", label: "Menu", permission: "menu.manage" },
  { href: "/admin/menu/options", label: "Product options", permission: "menu.manage" },
  { href: "/admin/orders", label: "Orders", permission: "orders.history_recent" },
  { href: "/admin/captains", label: "Captains", permission: "captains.manage" },
  { href: "/admin/suppliers", label: "Suppliers", permission: "suppliers.manage" },
  { href: "/admin/users", label: "Users & roles", permission: "users.manage" },
  { href: "/admin/reports", label: "Reports", permission: "reports.view_operational" },
  { href: "/admin/settings", label: "Settings", permission: "settings.manage" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.view" },
  { href: "/staff/cashier", label: "Cashier screen", permission: "orders.view_operational" },
  { href: "/staff/kitchen", label: "Kitchen screen", permission: "kitchen.view" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-zinc-200 bg-zinc-50 md:w-56 md:shrink-0 md:border-b-0 md:border-e">
        <Suspense fallback={<div className="p-4 text-sm text-zinc-500">…</div>}>
          <AdminNav />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

async function AdminNav() {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  const allowed = (p: Permission) => can(staff, p) || (p === "orders.history_recent" && can(staff, "orders.history_full")) || (p === "reports.view_operational" && can(staff, "reports.view_all"));
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-3">
      <Link href="/staff" className="mb-2 px-2 text-sm font-semibold text-zinc-500">
        {staff.name}
      </Link>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {LINKS.filter((l) => allowed(l.permission)).map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-zinc-200">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
