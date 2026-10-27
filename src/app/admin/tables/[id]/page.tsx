import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { orderUrlFor, qrSvg } from "@/server/tables/qr";
import { getTable } from "@/server/tables/service";
import { regenerateQrAction, updateTableAction } from "../actions";
import { TableForm } from "../table-form";
import { RegenerateForm } from "./regenerate-form";

export const metadata: Metadata = { title: "Table" };

export default function TablePage({ params }: PageProps<"/admin/tables/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/tables" className="text-sm underline">
        ← All tables
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <TableDetails params={params} />
      </Suspense>
    </main>
  );
}

async function TableDetails({ params }: { params: PageProps<"/admin/tables/[id]">["params"] }) {
  const staff = await requirePermission("tables.manage");
  const { id } = await params;
  const table = await getTable(staff, id);
  if (!table) notFound();
  const svg = await qrSvg(table.qrToken);
  const orderUrl = orderUrlFor(table.qrToken);

  return (
    <>
      <h1 className="text-2xl font-semibold">
        Table {table.number}
        {table.name ? ` · ${table.name}` : ""}
        {!table.isActive && <span className="ms-2 text-base font-normal text-red-700">(inactive)</span>}
      </h1>
      <section className="flex flex-wrap items-start gap-6">
        <div className="w-56 rounded-md border p-2" aria-label={`QR code for table ${table.number}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Ordering link: <code className="break-all" data-testid="order-url">{orderUrl}</code>
          </p>
          <p className="text-zinc-600">This code is permanent. Orders and sessions never change it.</p>
          <a className="underline" href={`/api/admin/tables/${table.id}/qr?format=png&download=1`}>
            Download PNG (high resolution)
          </a>
          <a className="underline" href={`/api/admin/tables/${table.id}/qr?format=svg&download=1`}>
            Download SVG
          </a>
          <Link className="underline" href={`/admin/tables/${table.id}/print`}>
            Print table card
          </Link>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Edit</h2>
        <TableForm action={updateTableAction.bind(null, table.id)} submitLabel="Save" defaults={table} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Replace QR code</h2>
        <RegenerateForm action={regenerateQrAction.bind(null, table.id)} />
      </section>
    </>
  );
}
