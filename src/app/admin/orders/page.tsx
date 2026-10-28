import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listOrderHistory } from "@/server/admin/history";
import { can } from "@/server/auth/permissions";
import { requireStaff } from "@/server/auth/session";
import { formatMoney } from "@/server/money";
import { DateFilter } from "../_components/date-filter";
import { dateTime, params } from "../_components/format";
import { input, label } from "../menu/form-styles";

export const metadata: Metadata = { title: "Orders" };

const STATUSES = ["NEW", "ACCEPTED", "IN_PREPARATION", "READY", "CANCELLED", "UNPAID", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"];

export default function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Orders({ searchParams }: { searchParams: PageProps<"/admin/orders">["searchParams"] }) {
  const staff = await requireStaff();
  if (!can(staff, "orders.history_full") && !can(staff, "orders.history_recent")) redirect("/forbidden");
  const sp = params(await searchParams);
  const h = await listOrderHistory(staff, sp);
  const query = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), from: h.range.from, to: h.range.to, page: String(page) }).toString();
  return (
    <>
      <DateFilter from={h.range.from} to={h.range.to}>
        <label className={label}>
          Table
          <input name="table" inputMode="numeric" defaultValue={sp.table} className={`${input} w-24`} />
        </label>
        <label className={label}>
          Status
          <select name="status" defaultValue={sp.status ?? ""} className={input}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Order ref
          <input name="q" defaultValue={sp.q} className={`${input} w-44`} />
        </label>
      </DateFilter>
      <p className="text-sm text-zinc-600">
        {h.total} orders, business days {h.range.from} to {h.range.to}. {!h.full && `You can see the last ${h.recentDays} days.`}
      </p>
      {h.rows.length === 0 ? (
        <p className="text-zinc-600">No orders match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className="py-2 pe-3 text-start">Order</th>
                <th className="py-2 pe-3 text-start">Table</th>
                <th className="py-2 pe-3 text-start">Placed</th>
                <th className="py-2 pe-3 text-start">Kitchen</th>
                <th className="py-2 pe-3 text-start">Chef</th>
                <th className="py-2 pe-3 text-start">Delivery</th>
                <th className="py-2 pe-3 text-start">Payment</th>
                <th className="py-2 pe-3 text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {h.rows.map((o) => (
                <tr key={o.id} className="border-b">
                  <td className="py-1.5 pe-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium underline">
                      {o.orderRef}
                    </Link>
                  </td>
                  <td className="py-1.5 pe-3">{o.tableNumber}</td>
                  <td className="py-1.5 pe-3">{dateTime(o.createdAt, h.timezone)}</td>
                  <td className="py-1.5 pe-3">{o.kitchenStatus}</td>
                  <td className="py-1.5 pe-3">{o.chef ?? "—"}</td>
                  <td className="py-1.5 pe-3">{o.deliveryStatus}</td>
                  <td className="py-1.5 pe-3">{o.paymentStatus}</td>
                  <td className="py-1.5 pe-3 text-end tabular-nums">{formatMoney(o.totalMinor, h.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {h.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {h.page > 1 && <Link href={`?${query(h.page - 1)}`} className="underline">Previous</Link>}
          <span>
            Page {h.page} of {h.pages}
          </span>
          {h.page < h.pages && <Link href={`?${query(h.page + 1)}`} className="underline">Next</Link>}
        </nav>
      )}
    </>
  );
}
