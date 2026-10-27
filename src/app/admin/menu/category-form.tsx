"use client";

import { useKeptForm } from "@/app/_components/use-kept-form";
import type { FormState } from "./actions";
import { FormResult } from "./form-result";
import { button, check, input, label } from "./form-styles";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  defaults?: { nameAr?: string; nameEn?: string; sortOrder?: number; isActive?: boolean };
};

export function CategoryForm({ action, submitLabel, defaults = {} }: Props) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className={label}>
        Name (Arabic)
        <input name="nameAr" dir="rtl" required maxLength={80} defaultValue={defaults.nameAr} className={input} />
      </label>
      <label className={label}>
        Name (English)
        <input name="nameEn" required maxLength={80} defaultValue={defaults.nameEn} className={input} />
      </label>
      <label className={label}>
        Display order
        <input name="sortOrder" type="number" min={0} max={9999} defaultValue={defaults.sortOrder ?? 0} className={`${input} w-24`} />
      </label>
      <label className={check}>
        <input name="isActive" type="checkbox" defaultChecked={defaults.isActive ?? true} />
        Active
      </label>
      <button type="submit" disabled={pending} className={button}>
        {submitLabel}
      </button>
      <FormResult state={state} />
    </form>
  );
}
