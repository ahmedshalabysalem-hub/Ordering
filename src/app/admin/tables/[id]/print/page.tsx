import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { sql } from "@/server/db/client";
import { qrSvg } from "@/server/tables/qr";
import { getTable } from "@/server/tables/service";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Table card" };

export default function PrintCardPage({ params }: PageProps<"/admin/tables/[id]/print">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Card params={params} />
      </Suspense>
    </main>
  );
}

async function Card({ params }: { params: PageProps<"/admin/tables/[id]/print">["params"] }) {
  const staff = await requirePermission("tables.manage");
  const { id } = await params;
  const table = await getTable(staff, id);
  if (!table) notFound();
  const [restaurant] = await sql<{ name_ar: string; name_en: string }[]>`
    select r.name_ar, r.name_en from branches b join restaurants r on r.id = b.restaurant_id where b.id = ${table.branchId}`;
  const svg = await qrSvg(table.qrToken);

  return (
    <>
      <article className="flex w-[90mm] flex-col items-center gap-3 rounded-xl border-2 border-zinc-900 p-6 text-center print:border">
        <p className="text-xl font-semibold" dir="rtl">{restaurant.name_ar}</p>
        <p className="text-lg">{restaurant.name_en}</p>
        <div className="w-[60mm]" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-3xl font-bold" data-testid="card-table-number">
          Table {table.number}
        </p>
        <p className="text-lg" dir="rtl">ترابيزة {table.number}</p>
        <p className="text-sm" dir="rtl">امسح الكود للطلب</p>
        <p className="text-sm">Scan to order</p>
      </article>
      <PrintButton />
    </>
  );
}
