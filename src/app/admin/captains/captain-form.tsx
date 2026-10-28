"use client";

import { type FormResult, useKeptForm } from "@/app/_components/use-kept-form";
import { button, check, input, label } from "../menu/form-styles";

export function CaptainForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormResult, form: FormData) => Promise<FormResult>;
  defaults?: { name: string; phone: string | null; isActive: boolean };
  submitLabel: string;
}) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: !defaults });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className={label}>
        Name
        <input name="name" required maxLength={80} defaultValue={defaults?.name} className={input} />
      </label>
      <label className={label}>
        Phone
        <input name="phone" maxLength={30} defaultValue={defaults?.phone ?? ""} className={input} />
      </label>
      {defaults ? (
        <label className={check}>
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} /> Active
        </label>
      ) : null}
      <button type="submit" disabled={pending} className={button}>
        {submitLabel}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      ) : state.ok ? (
        <p role="status" className="w-full text-sm text-green-700">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
