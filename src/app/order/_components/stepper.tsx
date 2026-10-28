"use client";

import { useLang } from "./lang";

/** Large −/+ quantity control (SPEC §18.1: simple quantity controls, large touch targets). */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label?: string }) {
  const { t } = useLang();
  const btn = "flex size-11 items-center justify-center rounded-full border border-zinc-300 text-xl font-semibold hover:bg-zinc-100 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label ?? t("product.quantity")}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={t("product.decrease")}>
        −
      </button>
      <output className="min-w-8 text-center text-lg font-semibold" aria-live="polite">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t("product.increase")}>
        +
      </button>
    </div>
  );
}
