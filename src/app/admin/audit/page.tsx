import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listAudit } from "@/server/admin/history";
import { requirePermission } from "@/server/auth/session";
import { DateFilter } from "../_components/date-filter";
import { dateTime, params } from "../_components/format";
import { input, label } from "../menu/form-styles";

export const metadata: Metadata = { title: "Audit log" };

// Read-only view of audit records (ADM-006, SPEC §21). No one can edit or delete them here.
export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const json = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v, null, 1));

async function Audit({ searchParams }: { searchParams: PageProps<"/admin/audit">["searchParams"] }) {
  const staff = await requirePermission("audit.view");
  const sp = params(await searchParams);
  const a = await listAudit(staff, sp);
  const query = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), from: a.range.from, to: a.range.to, page: String(page) }).toString();
  return (
    <>
      <DateFilter from={a.range.from} to={a.range.to}>
        <label className={label}>
          Action
          <select name="action" defaultValue={sp.action ?? ""} className={input}>
            <option value="">Any</option>
            {a.actions.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </DateFilter>
      <p className="text-sm text-zinc-600">
        {a.total} records ({a.timezone}).
      </p>
      {a.rows.length === 0 ? (
        <p className="text-zinc-600">No records in this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {a.rows.map((r) => (
            <li key={r.id} className="rounded-md border border-zinc-200 p-3 text-sm">
              <p>
                <span className="font-medium">{r.action}</span> · {r.entityType}
                {r.entityId ? <span className="text-zinc-500"> {r.entityId}</span> : null}
              </p>
              <p className="text-zinc-600">
                {dateTime(r.createdAt, a.timezone)} · {r.actor ?? "System"}
                {r.reason ? ` · Reason: ${r.reason}` : ""}
              </p>
              {(r.before !== null || r.after !== null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-zinc-600">Changes</summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded bg-zinc-50 p-2 text-xs">Before: {json(r.before)}</pre>
                    <pre className="overflow-x-auto rounded bg-zinc-50 p-2 text-xs">After: {json(r.after)}</pre>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {a.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {a.page > 1 && <Link href={`?${query(a.page - 1)}`} className="underline">Previous</Link>}
          <span>
            Page {a.page} of {a.pages}
          </span>
          {a.page < a.pages && <Link href={`?${query(a.page + 1)}`} className="underline">Next</Link>}
        </nav>
      )}
    </>
  );
}
