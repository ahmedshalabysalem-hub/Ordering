import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { listModifierGroups } from "@/server/menu/modifiers";
import { createGroupAction } from "../actions";
import { GroupForm } from "../group-form";
import { groupRule } from "../group-rule";

export const metadata: Metadata = { title: "Option groups" };

export default function OptionGroupsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/menu" className="text-sm underline">
        ← Menu
      </Link>
      <h1 className="text-2xl font-semibold">Option groups</h1>
      <p className="text-sm text-zinc-600">Sizes, extras and other choices. Create a group, add its options, then link it to products.</p>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Groups />
      </Suspense>
    </main>
  );
}

async function Groups() {
  const staff = await requirePermission("menu.manage");
  const groups = await listModifierGroups(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a group</h2>
        <GroupForm action={createGroupAction} submitLabel="Add group" />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">All groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <p className="text-zinc-600">No option groups yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{g.nameEn}</span> · <span dir="rtl">{g.nameAr}</span>
                  <span className="ms-2 text-sm text-zinc-600">
                    {groupRule(g.minSelect, g.maxSelect)} · {g.options.length} options{g.isActive ? "" : " · inactive"}
                  </span>
                </span>
                <Link href={`/admin/menu/options/${g.id}`} className="text-sm underline">
                  Open group {g.nameEn}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
