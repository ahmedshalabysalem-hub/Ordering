"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

export function RegenerateForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-red-200 p-4">
      <p className="text-sm text-zinc-700">
        Issue a new QR code only if the printed card is lost or misused. The current card stops working immediately.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Reason
        <input name="reason" required minLength={3} maxLength={200} className="rounded-md border border-zinc-300 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Type REGENERATE to confirm
        <input name="confirm" required className="rounded-md border border-zinc-300 px-3 py-2 font-normal" />
      </label>
      <button type="submit" disabled={pending} className="self-start rounded-md bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-60">
        Regenerate QR code
      </button>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
