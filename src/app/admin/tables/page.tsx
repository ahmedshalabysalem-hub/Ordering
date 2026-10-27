import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { listTables } from "@/server/tables/service";
import { createTableAction } from "./actions";
import { TableForm } from "./table-form";

export const metadata: Metadata = { title: "Tables & QR codes" };

export default function TablesPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Tables &amp; QR codes</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <TablesList />
      </Suspense>
    </main>
  );
}

async function TablesList() {
  const staff = await requirePermission("tables.manage");
  const tables = await listTables(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a table</h2>
        <TableForm action={createTableAction} submitLabel="Create table" />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">All tables ({tables.length})</h2>
        {tables.length === 0 ? (
          <p className="text-zinc-600">No tables yet. Create the first one above.</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className="py-2 text-start">Number</th>
                <th className="py-2 text-start">Name</th>
                <th className="py-2 text-start">Section</th>
                <th className="py-2 text-start">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-2 font-medium">{t.number}</td>
                  <td className="py-2">{t.name ?? "—"}</td>
                  <td className="py-2">{t.section ?? "—"}</td>
                  <td className="py-2">{t.isActive ? "Active" : "Inactive"}</td>
                  <td className="py-2 text-end">
                    <Link href={`/admin/tables/${t.id}`} className="underline">
                      Open table {t.number}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
