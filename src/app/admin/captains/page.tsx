import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { listCaptains } from "@/server/operations/captains";
import { createCaptainAction, updateCaptainAction } from "./actions";
import { CaptainForm } from "./captain-form";

export const metadata: Metadata = { title: "Captains" };

// Captains the cashier can assign orders to (OPS-003). Deactivate instead of delete.
export default function CaptainsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Captains</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Captains />
      </Suspense>
    </main>
  );
}

async function Captains() {
  const staff = await requirePermission("captains.manage");
  const captains = await listCaptains(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a captain</h2>
        <CaptainForm action={createCaptainAction} submitLabel="Add captain" />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">All captains ({captains.length})</h2>
        {captains.length === 0 ? <p className="text-zinc-600">No captains yet.</p> : null}
        {captains.map((c) => (
          <div key={c.id} className="rounded-lg border border-zinc-200 p-3">
            <CaptainForm action={updateCaptainAction.bind(null, c.id)} defaults={c} submitLabel={`Save ${c.name}`} />
          </div>
        ))}
      </section>
    </>
  );
}
