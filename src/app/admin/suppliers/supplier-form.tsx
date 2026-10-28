"use client";

import { type FormResult, useKeptForm } from "@/app/_components/use-kept-form";
import { FormMessage } from "../_components/form-message";
import { button, check, input, label } from "../menu/form-styles";

type Defaults = {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export function SupplierForm({ action, submitLabel, defaults }: { action: (prev: FormResult, form: FormData) => Promise<FormResult>; submitLabel: string; defaults?: Defaults }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: !defaults });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className={label}>
        Name
        <input name="name" required maxLength={120} defaultValue={defaults?.name} className={input} />
      </label>
      <label className={label}>
        Contact person
        <input name="contactPerson" maxLength={100} defaultValue={defaults?.contactPerson ?? ""} className={input} />
      </label>
      <label className={label}>
        Phone
        <input name="phone" type="tel" maxLength={30} defaultValue={defaults?.phone ?? ""} className={input} />
      </label>
      <label className={label}>
        Email
        <input name="email" type="email" maxLength={200} defaultValue={defaults?.email ?? ""} className={input} />
      </label>
      <label className={label}>
        Address
        <input name="address" maxLength={300} defaultValue={defaults?.address ?? ""} className={input} />
      </label>
      <label className={label}>
        Tax number
        <input name="taxNumber" maxLength={50} defaultValue={defaults?.taxNumber ?? ""} className={input} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Notes
        <textarea name="notes" maxLength={1000} rows={2} defaultValue={defaults?.notes ?? ""} className={input} />
      </label>
      {defaults && (
        <label className={check}>
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} /> Active
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={button}>
          {submitLabel}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
