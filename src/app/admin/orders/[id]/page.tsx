import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getOrderDetail } from "@/server/admin/history";
import { can } from "@/server/auth/permissions";
import { requireStaff } from "@/server/auth/session";
import { formatMoney } from "@/server/money";
import { dateTime } from "../../_components/format";

export const metadata: Metadata = { title: "Order details" };

export default function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/orders" className="text-sm underline">
        ← All orders
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (!can(staff, "orders.history_full") && !can(staff, "orders.history_recent")) redirect("/forbidden");
  const d = /^[0-9a-f-]{36}$/.test(id) ? await getOrderDetail(staff, id) : null;
  if (!d) notFound();
  const { order: o } = d;
  const m = (minor: number) => formatMoney(minor, o.currency);
  const { timezone } = d;
  return (
    <>
      <h1 className="text-2xl font-semibold">Order {o.orderRef}</h1>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-zinc-600">Table</dt>
        <dd>{o.tableNumberSnapshot}</dd>
        <dt className="text-zinc-600">Placed</dt>
        <dd>{dateTime(o.createdAt, timezone)}</dd>
        <dt className="text-zinc-600">Kitchen</dt>
        <dd>{o.kitchenStatus}</dd>
        <dt className="text-zinc-600">Delivery</dt>
        <dd>{o.deliveryStatus}</dd>
        <dt className="text-zinc-600">Payment</dt>
        <dd>{o.paymentStatus}</dd>
        <dt className="text-zinc-600">Paid (net)</dt>
        <dd className="tabular-nums">{m(o.paidMinor)}</dd>
      </dl>
      {o.customerNote && <p className="rounded-md bg-amber-50 p-3 text-sm">Customer note: {o.customerNote}</p>}
      {o.cancelReason && <p className="rounded-md bg-red-50 p-3 text-sm">Cancelled: {o.cancelReason}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Items</h2>
        <ul className="divide-y rounded-md border border-zinc-200 text-sm">
          {d.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 p-3">
              <div>
                <p className="font-medium">
                  {i.quantity} × {i.nameEnSnapshot} <span dir="rtl" className="text-zinc-500">{i.nameArSnapshot}</span>
                </p>
                {i.modifiers.map((mod) => (
                  <p key={mod.id} className="text-zinc-600">
                    {mod.groupNameEnSnapshot}: {mod.optionNameEnSnapshot}
                    {mod.priceDeltaMinor > 0 && ` (+${m(mod.priceDeltaMinor)})`}
                  </p>
                ))}
                {i.note && <p className="text-zinc-600">Note: {i.note}</p>}
              </div>
              <span className="tabular-nums">{m(i.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        <dl className="ms-auto grid w-64 grid-cols-2 gap-1 text-sm tabular-nums">
          <dt>Subtotal</dt>
          <dd className="text-end">{m(o.subtotalMinor)}</dd>
          {o.discountMinor > 0 && (
            <>
              <dt>Discount</dt>
              <dd className="text-end">−{m(o.discountMinor)}</dd>
            </>
          )}
          <dt>Tax</dt>
          <dd className="text-end">{m(o.taxMinor)}</dd>
          <dt>Service</dt>
          <dd className="text-end">{m(o.serviceMinor)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-end font-semibold">{m(o.totalMinor)}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Payments</h2>
        {d.payments.length === 0 ? (
          <p className="text-sm text-zinc-600">No payments recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.payments.map((p, n) => (
              <li key={n}>
                {dateTime(p.recordedAt, timezone)} · {p.kind === "REFUND" ? "Refund" : "Payment"} {m(p.amountMinor)} by {p.method}
                {p.reference && ` (ref ${p.reference})`} · {p.by}
                {p.reason && ` · ${p.reason}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.assignments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Captains</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {d.assignments.map((a, n) => (
              <li key={n}>
                {a.captain}: {dateTime(a.assignedAt, timezone)}
                {a.unassignedAt && ` until ${dateTime(a.unassignedAt, timezone)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">History</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {d.events.map((e, n) => (
            <li key={n}>
              {dateTime(e.createdAt, timezone)} · {e.type}
              {e.fromStatus || e.toStatus ? ` ${e.fromStatus ?? ""} → ${e.toStatus ?? ""}` : ""}
              {e.actor ? ` · ${e.actor}` : " · customer"}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
