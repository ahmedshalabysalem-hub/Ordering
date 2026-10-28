import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getCashierBoard } from "@/server/operations/boards";
import { CashierScreen } from "./cashier-screen";

export const metadata: Metadata = { title: "Cashier" };

// Cashier dashboard (OPS-001, SPEC §9): live table grid, order details and table actions.
export default function CashierPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-100 text-zinc-900">
      <Suspense fallback={<p className="p-6 text-zinc-500">Loading…</p>}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  const staff = await requirePermission("orders.view_operational");
  return <CashierScreen board={await getCashierBoard(staff)} />;
}
