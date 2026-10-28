import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { listChefs } from "@/server/operations/chefs";
import { createChefAction, updateChefAction } from "./actions";
import { ChefForm } from "./chef-form";

export const metadata: Metadata = { title: "Chefs" };

// Chefs the kitchen picks as responsible for an order (OPS-005, ADR-018). Deactivate instead of delete.
export default function ChefsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Chefs</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Chefs />
      </Suspense>
    </main>
  );
}

async function Chefs() {
  const staff = await requirePermission("chefs.manage");
  const chefs = await listChefs(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a chef</h2>
        <ChefForm action={createChefAction} submitLabel="Add chef" />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">All chefs ({chefs.length})</h2>
        {chefs.length === 0 ? <p className="text-zinc-600">No chefs yet.</p> : null}
        {chefs.map((c) => (
          <div key={c.id} className="rounded-lg border border-zinc-200 p-3">
            <ChefForm action={updateChefAction.bind(null, c.id)} defaults={c} submitLabel={`Save ${c.name}`} />
          </div>
        ))}
      </section>
    </>
  );
}
