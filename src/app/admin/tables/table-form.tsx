"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  defaults?: { number?: number; name?: string | null; section?: string | null; isActive?: boolean };
};

const input = "rounded-md border border-zinc-300 px-3 py-2 text-base font-normal";

export function TableForm({ action, submitLabel, defaults = {} }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Table number
        <input name="number" type="number" min={1} max={9999} required defaultValue={defaults.number} className={`${input} w-28`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name (optional)
        <input name="name" maxLength={60} defaultValue={defaults.name ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Section (optional)
        <input name="section" maxLength={60} defaultValue={defaults.section ?? ""} className={input} />
      </label>
      <label className="flex items-center gap-2 py-2 text-sm font-medium">
        <input name="isActive" type="checkbox" defaultChecked={defaults.isActive ?? true} />
        Active
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60">
        {submitLabel}
      </button>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="w-full text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
