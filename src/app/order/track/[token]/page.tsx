import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isFinal } from "@/server/customer/status";
import { getTrackedOrder } from "@/server/customer/tracking";
import { LangProvider } from "../../_components/lang";
import { customerLang } from "../../_lib/server-lang";
import { LiveOrder } from "./live-order";
import { TrackingView } from "./tracking-view";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };

// Order confirmation and tracking (UI-004, UI-005, SPEC §7.1). Only the random tracking token opens it.
export default function TrackOrderPage({ params }: PageProps<"/order/track/[token]">) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
      <Suspense fallback={<p className="p-6 text-center text-zinc-500">…</p>}>
        <TrackedOrder params={params} />
      </Suspense>
    </main>
  );
}

async function TrackedOrder({ params }: { params: PageProps<"/order/track/[token]">["params"] }) {
  const { token } = await params;
  const order = await getTrackedOrder(token);
  if (!order) notFound();
  return (
    <LangProvider initial={await customerLang("ar")}>
      <TrackingView order={order} trackingToken={token} />
      {isFinal(order) ? null : <LiveOrder trackingToken={token} />}
    </LangProvider>
  );
}
