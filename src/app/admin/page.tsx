import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLiveCounts, getReport } from "@/server/admin/reports";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { formatMoney } from "@/server/money";
import { duration } from "./_components/format";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

async function Overview() {
  const staff = await requireStaff();
  if (!can(staff, "reports.view_operational") && !can(staff, "reports.view_all")) {
    return (
      <p className="text-zinc-600">
        Choose a screen from the menu. <Link href="/staff" className="underline">Staff home</Link>
      </p>
    );
  }
  const [report, live] = await Promise.all([getReport(staff, {}), getLiveCounts(staff)]);
  const money = (m: number) => formatMoney(m, report.currency);
  const t = report.totals;
  return (
    <>
      <section aria-label="Right now" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active orders" value={String(live.activeOrders)} hint="New, accepted, preparing or ready" />
        <Stat label="Open tables" value={String(live.openTables)} />
        <Stat label="Waiting for help" value={String(live.pendingAssistance)} />
        <Stat label="Unpaid on open tables" value={money(live.unpaidMinor)} />
      </section>
      <section aria-label="Today" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Today ({report.range.to})</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Orders" value={String(t.orders)} hint={t.cancelled ? `${t.cancelled} cancelled` : undefined} />
          <Stat label="Order total" value={money(t.totalMinor)} hint="Owed, not necessarily paid" />
          <Stat label="Net recorded sales" value={money(t.netMinor)} hint="Payments minus refunds" />
          <Stat label="Outstanding" value={money(t.outstandingMinor)} />
          <Stat label="Average preparation" value={duration(report.timing.avgPrepSeconds)} hint={`${report.timing.prepOrders} orders reached ready`} />
          <Stat label="Average to delivery" value={duration(report.timing.avgCompletionSeconds)} hint={`${report.timing.completedOrders} delivered`} />
        </div>
        <p className="text-sm">
          <Link href="/admin/reports" className="underline">
            Full reports
          </Link>
        </p>
      </section>
    </>
  );
}
