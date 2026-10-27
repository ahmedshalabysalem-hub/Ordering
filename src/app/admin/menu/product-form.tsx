"use client";

import { useKeptForm } from "@/app/_components/use-kept-form";
import type { FormState } from "./actions";
import { FormResult } from "./form-result";
import { button, check, input, label } from "./form-styles";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  currency: string;
  categories: { id: string; nameEn: string; nameAr: string }[];
  defaults?: {
    categoryId?: string;
    nameAr?: string;
    nameEn?: string;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    price?: string;
    sku?: string | null;
    sortOrder?: number;
    isAvailable?: boolean;
    isActive?: boolean;
    prepStation?: string | null;
    prepMinutes?: number | null;
    imageUrl?: string | null;
  };
};

export function ProductForm({ action, submitLabel, currency, categories, defaults = {} }: Props) {
  const { state, pending, formRef, onSubmit } = useKeptForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className={label}>
        Category
        <select name="categoryId" required defaultValue={defaults.categoryId ?? ""} className={input}>
          <option value="" disabled>
            Choose…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn} · {c.nameAr}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Price ({currency})
        <input name="price" required inputMode="decimal" placeholder="45.50" defaultValue={defaults.price} className={input} />
      </label>
      <label className={label}>
        Name (Arabic)
        <input name="nameAr" dir="rtl" required maxLength={80} defaultValue={defaults.nameAr} className={input} />
      </label>
      <label className={label}>
        Name (English)
        <input name="nameEn" required maxLength={80} defaultValue={defaults.nameEn} className={input} />
      </label>
      <label className={label}>
        Description (Arabic)
        <textarea name="descriptionAr" dir="rtl" maxLength={500} rows={2} defaultValue={defaults.descriptionAr ?? ""} className={input} />
      </label>
      <label className={label}>
        Description (English)
        <textarea name="descriptionEn" maxLength={500} rows={2} defaultValue={defaults.descriptionEn ?? ""} className={input} />
      </label>
      <label className={label}>
        SKU (optional)
        <input name="sku" maxLength={40} defaultValue={defaults.sku ?? ""} className={input} />
      </label>
      <label className={label}>
        Display order
        <input name="sortOrder" type="number" min={0} max={9999} defaultValue={defaults.sortOrder ?? 0} className={input} />
      </label>
      <label className={label}>
        Preparation station (optional)
        <input name="prepStation" maxLength={40} placeholder="Kitchen, Bar…" defaultValue={defaults.prepStation ?? ""} className={input} />
      </label>
      <label className={label}>
        Preparation time in minutes (optional)
        <input name="prepMinutes" type="number" min={1} max={240} defaultValue={defaults.prepMinutes ?? ""} className={input} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        {defaults.imageUrl && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own media route */}
            <img src={defaults.imageUrl} alt="Current product image" className="h-24 w-24 rounded-md object-cover" />
            <label className={check}>
              <input name="removeImage" type="checkbox" />
              Remove image
            </label>
          </div>
        )}
        <label className={label}>
          Image (JPEG, PNG or WebP, up to 2 MB)
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className={check}>
          <input name="isAvailable" type="checkbox" defaultChecked={defaults.isAvailable ?? true} />
          Available
        </label>
        <label className={check}>
          <input name="isActive" type="checkbox" defaultChecked={defaults.isActive ?? true} />
          Shown on the menu
        </label>
        <button type="submit" disabled={pending} className={button}>
          {submitLabel}
        </button>
      </div>
      <FormResult state={state} />
    </form>
  );
}
