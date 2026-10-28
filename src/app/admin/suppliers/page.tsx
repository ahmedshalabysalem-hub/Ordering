import type { Metadata } from "next";
import { Suspense } from "react";
import { listSuppliers } from "@/server/admin/suppliers";
import { requirePermission } from "@/server/auth/session";
import { createSupplierAction, updateSupplierAction } from "./actions";
import { SupplierForm } from "./supplier-form";

export const metadata: Metadata = { title: "Suppliers" };

// Basic supplier records (ADM-003). Deactivate instead of delete.
export default function SuppliersPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Suppliers</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Suppliers />
      </Suspense>
    </main>
  );
}

async function Suppliers() {
  const staff = await requirePermission("suppliers.manage");
  const rows = await listSuppliers(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a supplier</h2>
        <SupplierForm action={createSupplierAction} submitLabel="Add supplier" />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">All suppliers ({rows.length})</h2>
        {rows.length === 0 ? <p className="text-zinc-600">No suppliers yet.</p> : null}
        {rows.map((s) => (
          <details key={s.id} className="rounded-lg border border-zinc-200 p-3">
            <summary className="cursor-pointer font-medium">
              {s.name}
              {s.phone ? <span className="ms-2 text-sm font-normal text-zinc-600">{s.phone}</span> : null}
              {!s.isActive && <span className="ms-2 rounded bg-zinc-200 px-1.5 text-xs">Inactive</span>}
            </summary>
            <div className="pt-3">
              <SupplierForm action={updateSupplierAction.bind(null, s.id)} defaults={s} submitLabel={`Save ${s.name}`} />
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
