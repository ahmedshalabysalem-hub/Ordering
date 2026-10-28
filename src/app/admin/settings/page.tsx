import type { Metadata } from "next";
import { Suspense } from "react";
import { getSettings } from "@/server/admin/settings";
import { requirePermission } from "@/server/auth/session";
import { addPaymentMethodAction, togglePaymentMethodAction, updateSettingsAction } from "./actions";
import { PaymentMethodForm, PaymentMethodToggle, SettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  const staff = await requirePermission("settings.manage");
  const { paymentMethods, ...settings } = await getSettings(staff);
  return (
    <>
      <SettingsForm action={updateSettingsAction} s={settings} />
      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-medium">Payment methods</h2>
        <ul className="flex flex-col gap-2">
          {paymentMethods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2">
              <span>
                <span className="font-medium">{m.nameEn}</span> · <span dir="rtl">{m.nameAr}</span> <span className="text-xs text-zinc-500">({m.code})</span>
                {!m.isActive && <span className="ms-2 rounded bg-zinc-200 px-1.5 text-xs">Disabled</span>}
              </span>
              <PaymentMethodToggle name={m.nameEn} isActive={m.isActive} toggle={togglePaymentMethodAction.bind(null, m.id)} />
            </li>
          ))}
        </ul>
        <PaymentMethodForm action={addPaymentMethodAction} />
      </section>
    </>
  );
}
