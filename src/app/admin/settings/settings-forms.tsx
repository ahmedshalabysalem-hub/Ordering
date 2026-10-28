"use client";

import { useTransition } from "react";
import { type FormResult, useKeptForm } from "@/app/_components/use-kept-form";
import type { SettingsView } from "@/server/admin/settings";
import { FormMessage } from "../_components/form-message";
import { button, check, input, label } from "../menu/form-styles";

type Action = (prev: FormResult, form: FormData) => Promise<FormResult>;

export function SettingsForm({ action, s }: { action: Action; s: Omit<SettingsView, "paymentMethods"> }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Restaurant</legend>
        <label className={label}>
          Name (Arabic)
          <input name="restaurantNameAr" dir="rtl" required maxLength={100} defaultValue={s.restaurantNameAr} className={input} />
        </label>
        <label className={label}>
          Name (English)
          <input name="restaurantNameEn" required maxLength={100} defaultValue={s.restaurantNameEn} className={input} />
        </label>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Logo</span>
          {s.logoUrl && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logoUrl} alt="Current logo" className="h-16 w-16 rounded-md object-contain" />
              <label className={check}>
                <input type="checkbox" name="removeLogo" /> Remove logo
              </label>
            </div>
          )}
          <input name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" aria-label="Upload logo" />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Region and language</legend>
        <label className={label}>
          Time zone
          <input name="timezone" required defaultValue={s.timezone} className={input} />
        </label>
        <label className={label}>
          Currency
          <input name="currency" required maxLength={3} defaultValue={s.currency} disabled={s.hasOrders} className={input} />
          {s.hasOrders && (
            <>
              <input type="hidden" name="currency" value={s.currency} />
              <span className="text-xs font-normal text-zinc-500">Locked because orders exist.</span>
            </>
          )}
        </label>
        <label className={label}>
          Default customer language
          <select name="defaultLanguage" defaultValue={s.defaultLanguage} className={input}>
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className={label}>
          Fallback language
          <select name="fallbackLanguage" defaultValue={s.fallbackLanguage} className={input}>
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Tax and service</legend>
        <label className={label}>
          Tax rate (%)
          <input name="taxPercent" required inputMode="decimal" defaultValue={s.taxPercent} className={input} />
        </label>
        <label className={label}>
          Service charge (%)
          <input name="servicePercent" required inputMode="decimal" defaultValue={s.servicePercent} className={input} />
        </label>
        <label className={`${check} sm:col-span-2`}>
          <input type="checkbox" name="pricesIncludeTax" defaultChecked={s.pricesIncludeTax} /> Menu prices already include tax
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Operations</legend>
        <label className={label}>
          Kitchen warning after (minutes)
          <input name="prepWarnMinutes" type="number" min={1} max={240} required defaultValue={s.prepWarnMinutes} className={input} />
        </label>
        <label className={label}>
          Kitchen overdue after (minutes)
          <input name="prepOverdueMinutes" type="number" min={1} max={480} required defaultValue={s.prepOverdueMinutes} className={input} />
        </label>
        <label className={label}>
          Table can close when
          <select name="sessionClosePolicy" defaultValue={s.sessionClosePolicy} className={input}>
            <option value="ALL_PAID_AND_DELIVERED">All orders paid and delivered</option>
            <option value="ALL_PAID">All orders paid</option>
          </select>
        </label>
        <label className={label}>
          Assistance cooldown (seconds)
          <input name="assistanceCooldownSeconds" type="number" min={0} max={3600} required defaultValue={s.assistanceCooldownSeconds} className={input} />
        </label>
        <label className={`${check} sm:col-span-2`}>
          <input type="checkbox" name="newOrderSound" defaultChecked={s.newOrderSound} /> Play a sound for new orders
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          Save settings
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PaymentMethodForm({ action }: { action: Action }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className={label}>
        Code
        <input name="code" required maxLength={20} placeholder="INSTAPAY" className={input} />
      </label>
      <label className={label}>
        Name (Arabic)
        <input name="nameAr" dir="rtl" required maxLength={50} className={input} />
      </label>
      <label className={label}>
        Name (English)
        <input name="nameEn" required maxLength={50} className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>
        Add method
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function PaymentMethodToggle({ name, isActive, toggle }: { name: string; isActive: boolean; toggle: (isActive: boolean) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => toggle(!isActive))} className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-60">
      {isActive ? `Disable ${name}` : `Enable ${name}`}
    </button>
  );
}
