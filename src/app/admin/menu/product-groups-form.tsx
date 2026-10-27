"use client";

import { useKeptForm } from "@/app/_components/use-kept-form";
import type { FormState } from "./actions";
import { FormResult } from "./form-result";
import { button, check } from "./form-styles";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  groups: { id: string; nameEn: string; nameAr: string; rule: string; isActive: boolean }[];
  selected: string[];
};

export function ProductGroupsForm({ action, groups, selected }: Props) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-label="Option groups" className="flex flex-col gap-1">
      {groups.map((g) => (
        <label key={g.id} className={check}>
          <input name="groupIds" type="checkbox" value={g.id} defaultChecked={selected.includes(g.id)} />
          {g.nameEn} · <span dir="rtl">{g.nameAr}</span>
          <span className="font-normal text-zinc-600">
            ({g.rule}
            {g.isActive ? "" : ", inactive"})
          </span>
        </label>
      ))}
      <button type="submit" disabled={pending} className={`${button} mt-2 self-start`}>
        Save option groups
      </button>
      <FormResult state={state} />
    </form>
  );
}
