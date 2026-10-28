import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getReport, type MoneyTotals, type ReportSection } from "@/server/admin/reports";
import { can } from "@/server/auth/permissions";
import { requireStaff } from "@/server/auth/session";
import { formatMoney } from "@/server/money";
import { DateFilter } from "../_components/date-filter";
import { dateTime, duration, params } from "../_components/format";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const th = "py-2 pe-3 text-start font-medium";
const td = "py-1.5 pe-3 tabular-nums";

function Section({ title, section, range, empty, children }: { title: string; section: ReportSection; range: { from: string; to: string }; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {!empty && (
          <a href={`/api/admin/reports/csv?section=${section}&from=${range.from}&to=${range.to}`} className="text-sm underline">
            Download CSV
          </a>
        )}
      </div>
      {empty ? <p className="text-sm text-zinc-500">No data in this period.</p> : <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const staff = await requireStaff();
  if (!can(staff, "reports.view_operational") && !can(staff, "reports.view_all")) redirect("/forbidden");
  const sp = params(await searchParams);
  const r = await getReport(staff, { from: sp.from, to: sp.to });
  const m = (minor: number) => formatMoney(minor, r.currency);
  const moneyCells = (t: MoneyTotals) => (
    <>
      <td className={td}>{t.orders}</td>
      <td className={td}>{t.cancelled}</td>
      <td className={td}>{m(t.grossMinor)}</td>
      <td className={td}>{m(t.discountMinor)}</td>
      <td className={td}>{m(t.taxMinor)}</td>
      <td className={td}>{m(t.serviceMinor)}</td>
      <td className={td}>{m(t.totalMinor)}</td>
      <td className={td}>{m(t.paymentsMinor)}</td>
      <td className={td}>{m(t.refundsMinor)}</td>
      <td className={`${td} font-semibold`}>{m(t.netMinor)}</td>
      <td className={td}>{m(t.outstandingMinor)}</td>
    </>
  );
  return (
    <>
      <DateFilter from={r.range.from} to={r.range.to} />
      <p className="text-sm text-zinc-600">
        Business days {r.range.from} to {r.range.to} ({r.timezone}).{" "}
        {!r.full && "Cashiers see the last 7 days. "}
        {r.clamped && "The range was shortened to what you may view. "}
      </p>
      <details className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
        <summary className="cursor-pointer font-medium">How these numbers are defined</summary>
        <ul className="mt-2 list-disc ps-5">
          <li>Figures cover orders placed on the chosen business days. Cancelled orders are counted but excluded from money columns.</li>
          <li>Gross: item and option prices before discounts, tax and service. Order total: gross − discounts + tax + service.</li>
          <li>Payments and refunds: what staff recorded against those orders. Net recorded sales = payments − refunds.</li>
          <li>Outstanding: order totals not yet covered by net payments. Unpaid orders are never counted as collected.</li>
        </ul>
      </details>

      <Section title="Sales by day" section="daily" range={r.range} empty={r.daily.length === 0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-zinc-600">
              <th className={th}>Date</th>
              <th className={th}>Orders</th>
              <th className={th}>Cancelled</th>
              <th className={th}>Gross</th>
              <th className={th}>Discounts</th>
              <th className={th}>Tax</th>
              <th className={th}>Service</th>
              <th className={th}>Order total</th>
              <th className={th}>Payments</th>
              <th className={th}>Refunds</th>
              <th className={th}>Net recorded sales</th>
              <th className={th}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {r.daily.map((d) => (
              <tr key={d.date} className="border-b">
                <td className={td}>{d.date}</td>
                {moneyCells(d)}
              </tr>
            ))}
            <tr className="font-semibold" data-testid="report-totals">
              <td className={td}>Total</td>
              {moneyCells(r.totals)}
            </tr>
          </tbody>
        </table>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sales by payment method" section="payment-methods" range={r.range} empty={r.byPaymentMethod.length === 0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className={th}>Method</th>
                <th className={th}>Payments</th>
                <th className={th}>Amount</th>
                <th className={th}>Refunds</th>
                <th className={th}>Net</th>
              </tr>
            </thead>
            <tbody>
              {r.byPaymentMethod.map((p) => (
                <tr key={p.method} className="border-b">
                  <td className={td}>{p.method}</td>
                  <td className={td}>{p.count}</td>
                  <td className={td}>{m(p.paymentsMinor)}</td>
                  <td className={td}>{m(p.refundsMinor)}</td>
                  <td className={td}>{m(p.netMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Orders by kitchen status" section="status" range={r.range} empty={r.byStatus.length === 0}>
          <table className="w-full text-sm">
            <tbody>
              {r.byStatus.map((s) => (
                <tr key={s.status} className="border-b">
                  <td className={td}>{s.status}</td>
                  <td className={td}>{s.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Top-selling products" section="products" range={r.range} empty={r.topProducts.length === 0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className={th}>Product</th>
                <th className={th}>Quantity</th>
                <th className={th}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {r.topProducts.map((p) => (
                <tr key={p.name} className="border-b">
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.quantity}</td>
                  <td className={td}>{m(p.revenueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Category performance" section="categories" range={r.range} empty={r.categories.length === 0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className={th}>Category</th>
                <th className={th}>Quantity</th>
                <th className={th}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {r.categories.map((c) => (
                <tr key={c.name} className="border-b">
                  <td className={td}>{c.name}</td>
                  <td className={td}>{c.quantity}</td>
                  <td className={td}>{m(c.revenueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Orders by table" section="tables" range={r.range} empty={r.byTable.length === 0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-600">
                <th className={th}>Table</th>
                <th className={th}>Orders</th>
                <th className={th}>Order total</th>
              </tr>
            </thead>
            <tbody>
              {r.byTable.map((t) => (
                <tr key={t.tableNumber} className="border-b">
                  <td className={td}>{t.tableNumber}</td>
                  <td className={td}>{t.orders}</td>
                  <td className={td}>{m(t.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <section className="flex flex-col gap-2" aria-label="Timing">
          <h2 className="text-lg font-medium">Timing</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-zinc-600">Average preparation (placed → ready)</dt>
            <dd className="tabular-nums">
              {duration(r.timing.avgPrepSeconds)} <span className="text-zinc-500">({r.timing.prepOrders} orders)</span>
            </dd>
            <dt className="text-zinc-600">Average completion (placed → delivered)</dt>
            <dd className="tabular-nums">
              {duration(r.timing.avgCompletionSeconds)} <span className="text-zinc-500">({r.timing.completedOrders} orders)</span>
            </dd>
          </dl>
        </section>
      </div>

      <Section title="Captains" section="captains" range={r.range} empty={r.captains.length === 0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-zinc-600">
              <th className={th}>Captain</th>
              <th className={th}>Assigned</th>
              <th className={th}>Delivered</th>
              <th className={th}>Average assign → delivered</th>
            </tr>
          </thead>
          <tbody>
            {r.captains.map((c) => (
              <tr key={c.name} className="border-b">
                <td className={td}>{c.name}</td>
                <td className={td}>{c.assigned}</td>
                <td className={td}>{c.delivered}</td>
                <td className={td}>{duration(c.avgDeliverySeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Cancelled orders" section="cancelled" range={r.range} empty={r.cancelled.length === 0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-zinc-600">
              <th className={th}>Order</th>
              <th className={th}>Table</th>
              <th className={th}>Placed</th>
              <th className={th}>Total</th>
              <th className={th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {r.cancelled.map((c) => (
              <tr key={c.orderRef} className="border-b">
                <td className={td}>{c.orderRef}</td>
                <td className={td}>{c.tableNumber}</td>
                <td className={td}>{dateTime(c.createdAt, r.timezone)}</td>
                <td className={td}>{m(c.totalMinor)}</td>
                <td className="py-1.5">{c.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
