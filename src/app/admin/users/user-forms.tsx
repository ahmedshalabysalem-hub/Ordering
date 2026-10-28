"use client";

import { type FormResult as Result, useKeptForm } from "@/app/_components/use-kept-form";
import { FormMessage as Message } from "../_components/form-message";
import { button, check, input, label } from "../menu/form-styles";

const ROLE_LABELS = { ADMIN: "Admin", CASHIER: "Cashier", KITCHEN: "Kitchen" } as const;

function RoleSelect({ value }: { value?: string }) {
  return (
    <label className={label}>
      Role
      <select name="role" defaultValue={value ?? "CASHIER"} className={input}>
        {Object.entries(ROLE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewUserForm({ action }: { action: (prev: Result, form: FormData) => Promise<Result> }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className={label}>
        Name
        <input name="name" required maxLength={100} className={input} />
      </label>
      <label className={label}>
        Email
        <input name="email" type="email" required className={input} autoComplete="off" />
      </label>
      <RoleSelect />
      <label className={label}>
        Temporary password
        <input name="password" type="password" required minLength={10} maxLength={128} className={input} autoComplete="new-password" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={button}>
          Create user
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function EditUserForm({
  action,
  defaults,
}: {
  action: (prev: Result, form: FormData) => Promise<Result>;
  defaults: { name: string; role: string | null; isActive: boolean };
}) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className={label}>
        Name
        <input name="name" required maxLength={100} defaultValue={defaults.name} className={input} />
      </label>
      <RoleSelect value={defaults.role ?? undefined} />
      <label className={check}>
        <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} /> Account active
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          Save user
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ action }: { action: (prev: Result, form: FormData) => Promise<Result> }) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className={label}>
        New password
        <input name="password" type="password" required minLength={10} maxLength={128} className={input} autoComplete="new-password" />
      </label>
      <button type="submit" disabled={pending} className={button}>
        Set new password
      </button>
      <Message state={state} />
    </form>
  );
}
