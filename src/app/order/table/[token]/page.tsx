import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { resolveQrToken } from "@/server/tables/service";

export const metadata: Metadata = { title: "Order" };

// Customer landing page for a table QR code. The table identity comes only from the token (SPEC §6.1).
// The menu and cart are added by the customer-ordering tasks (UI-001..005).
export default function OrderTablePage({ params }: PageProps<"/order/table/[token]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Suspense fallback={<p className="text-zinc-500">…</p>}>
        <TableHeader params={params} />
      </Suspense>
    </main>
  );
}

async function TableHeader({ params }: { params: PageProps<"/order/table/[token]">["params"] }) {
  const { token } = await params;
  const table = await resolveQrToken(token);
  if (table.status === "not_found") notFound();
  if (table.status === "inactive") {
    return (
      <>
        <h1 className="text-2xl font-semibold">{table.restaurantNameEn}</h1>
        <p dir="rtl">هذه الترابيزة غير متاحة للطلب حالياً. من فضلك اطلب المساعدة من الموظفين.</p>
        <p>This table is not taking orders right now. Please ask a member of staff.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">{table.restaurantNameEn}</h1>
      <p className="text-lg" dir="rtl">{table.restaurantNameAr}</p>
      <p className="text-3xl font-bold" data-testid="table-number">
        Table {table.number}
      </p>
    </>
  );
}
