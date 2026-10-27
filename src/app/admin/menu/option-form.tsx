"use client";

import { useKeptForm } from "@/app/_components/use-kept-form";
import type { FormState } from "./actions";
import { FormResult } from "./form-result";
import { button, check, input, label } from "./form-styles";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  currency: string;
  /** Names the form for screen readers and tests, e.g. "Option Large". */
  title: string;
  resetOnSuccess?: boolean;
  defaults?: { nameAr?: string; nameEn?: string; priceDelta?: string; sortOrder?: number; isAvailable?: boolean };
};

export function OptionForm({ action, submitLabel, currency, title, resetOnSuccess = false, defaults = {} }: Props) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess });
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-label={title} className="flex flex-wrap items-end gap-3 border-b py-3">
      <label className={label}>
        Name (Arabic)
        <input name="nameAr" dir="rtl" required maxLength={80} defaultValue={defaults.nameAr} className={input} />
      </label>
      <label className={label}>
        Name (English)
        <input name="nameEn" required maxLength={80} defaultValue={defaults.nameEn} className={input} />
      </label>
      <label className={label}>
        Extra price ({currency})
        <input name="priceDelta" inputMode="decimal" placeholder="0" defaultValue={defaults.priceDelta} className={`${input} w-28`} />
      </label>
      <label className={label}>
        Display order
        <input name="sortOrder" type="number" min={0} max={9999} defaultValue={defaults.sortOrder ?? 0} className={`${input} w-24`} />
      </label>
      <label className={check}>
        <input name="isAvailable" type="checkbox" defaultChecked={defaults.isAvailable ?? true} />
        Available
      </label>
      <button type="submit" disabled={pending} className={button}>
        {submitLabel}
      </button>
      <FormResult state={state} />
    </form>
  );
}
