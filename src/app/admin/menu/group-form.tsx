"use client";

import { useKeptForm } from "@/app/_components/use-kept-form";
import type { FormState } from "./actions";
import { FormResult } from "./form-result";
import { button, check, input, label } from "./form-styles";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  defaults?: { nameAr?: string; nameEn?: string; minSelect?: number; maxSelect?: number; isActive?: boolean };
};

export function GroupForm({ action, submitLabel, defaults = {} }: Props) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className={label}>
        Name (Arabic)
        <input name="nameAr" dir="rtl" required maxLength={80} defaultValue={defaults.nameAr} className={input} />
      </label>
      <label className={label}>
        Name (English)
        <input name="nameEn" required maxLength={80} placeholder="Size, Extras…" defaultValue={defaults.nameEn} className={input} />
      </label>
      <label className={label}>
        Minimum choices
        <input name="minSelect" type="number" min={0} max={20} defaultValue={defaults.minSelect ?? 0} className={`${input} w-24`} />
      </label>
      <label className={label}>
        Maximum choices
        <input name="maxSelect" type="number" min={1} max={20} defaultValue={defaults.maxSelect ?? 1} className={`${input} w-24`} />
      </label>
      <label className={check}>
        <input name="isActive" type="checkbox" defaultChecked={defaults.isActive ?? true} />
        Active
      </label>
      <button type="submit" disabled={pending} className={button}>
        {submitLabel}
      </button>
      <p className="w-full text-xs text-zinc-600">Minimum 0 makes the group optional; 1 or more makes it required.</p>
      <FormResult state={state} />
    </form>
  );
}
