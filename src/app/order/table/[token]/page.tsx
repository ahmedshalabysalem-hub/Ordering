import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPublicMenu } from "@/server/customer/menu";
import { resolveQrToken } from "@/server/tables/service";
import { LangProvider } from "../../_components/lang";
import { TableUnavailable } from "../../_components/unavailable";
import { customerLang } from "../../_lib/server-lang";
import { OrderingApp } from "./ordering-app";

export const metadata: Metadata = { title: "Menu", robots: { index: false, follow: false } };

// Customer ordering page for a table QR code (UI-001..005, ADR-013). The table identity comes only
// from the token (SPEC §6.1); the menu is read fresh on every load.
export default function OrderTablePage({ params }: PageProps<"/order/table/[token]">) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
      <Suspense fallback={<p className="p-6 text-center text-zinc-500">…</p>}>
        <TableMenu params={params} />
      </Suspense>
    </main>
  );
}

async function TableMenu({ params }: { params: PageProps<"/order/table/[token]">["params"] }) {
  const { token } = await params;
  const table = await resolveQrToken(token);
  if (table.status === "not_found") notFound();
  if (table.status === "inactive") {
    return (
      <LangProvider initial={await customerLang("ar")}>
        <TableUnavailable nameAr={table.restaurantNameAr} nameEn={table.restaurantNameEn} />
      </LangProvider>
    );
  }
  const menu = await getPublicMenu(table.branchId);
  const lang = await customerLang(menu.defaultLanguage);
  return (
    <LangProvider initial={lang}>
      <OrderingApp qrToken={token} tableNumber={table.number} menu={menu} />
    </LangProvider>
  );
}
