import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getModifierGroup } from "@/server/menu/modifiers";
import { getMenuCurrency } from "@/server/menu/service";
import { minorToDecimal } from "@/server/money";
import { addOptionAction, updateGroupAction, updateOptionAction } from "../../actions";
import { GroupForm } from "../../group-form";
import { groupRule } from "../../group-rule";
import { OptionForm } from "../../option-form";

export const metadata: Metadata = { title: "Option group" };

export default function OptionGroupPage({ params }: PageProps<"/admin/menu/options/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <Link href="/admin/menu/options" className="text-sm underline">
        ← Option groups
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <GroupDetails params={params} />
      </Suspense>
    </main>
  );
}

async function GroupDetails({ params }: { params: PageProps<"/admin/menu/options/[id]">["params"] }) {
  const staff = await requirePermission("menu.manage");
  const { id } = await params;
  const [group, currency] = await Promise.all([getModifierGroup(staff, id), getMenuCurrency(staff)]);
  if (!group) notFound();
  return (
    <>
      <h1 className="text-2xl font-semibold">
        {group.nameEn} · <span dir="rtl">{group.nameAr}</span>
      </h1>
      <p className="text-sm text-zinc-600">Customers must follow this rule: {groupRule(group.minSelect, group.maxSelect)}.</p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Edit group</h2>
        <GroupForm action={updateGroupAction.bind(null, group.id)} submitLabel="Save group" defaults={group} />
      </section>
      <section className="flex flex-col">
        <h2 className="text-lg font-medium">Options ({group.options.length})</h2>
        <p className="text-sm text-zinc-600">Untick Available to hide an option; options are never deleted.</p>
        {group.options.map((o) => (
          <OptionForm
            key={o.id}
            title={`Option ${o.nameEn}`}
            action={updateOptionAction.bind(null, o.id, group.id)}
            submitLabel="Save"
            currency={currency}
            defaults={{ ...o, priceDelta: o.priceDeltaMinor === 0 ? "" : minorToDecimal(o.priceDeltaMinor, currency) }}
          />
        ))}
      </section>
      <section className="flex flex-col">
        <h2 className="text-lg font-medium">Add an option</h2>
        <OptionForm title="New option" action={addOptionAction.bind(null, group.id)} submitLabel="Add option" currency={currency} resetOnSuccess />
      </section>
    </>
  );
}
