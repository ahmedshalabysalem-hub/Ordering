import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getKitchenBoard } from "@/server/operations/boards";
import { KitchenScreen } from "./kitchen-screen";

export const metadata: Metadata = { title: "Kitchen" };

// Kitchen display (OPS-002, SPEC §10): live tickets with large text and one-tap status moves.
export default function KitchenPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-950 text-zinc-50">
      <Suspense fallback={<p className="p-6 text-zinc-400">Loading…</p>}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  const staff = await requirePermission("kitchen.view");
  return <KitchenScreen board={await getKitchenBoard(staff)} />;
}
