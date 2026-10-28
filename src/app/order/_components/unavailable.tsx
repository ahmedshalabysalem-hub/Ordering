"use client";

import { pick } from "@/i18n";
import { LangSwitch, useLang } from "./lang";

/** Shown for an inactive table (SPEC §5): no menu, just a clear message in the chosen language. */
export function TableUnavailable({ nameAr, nameEn }: { nameAr: string; nameEn: string }) {
  const { lang, t } = useLang();
  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <LangSwitch />
      <h1 className="text-2xl font-semibold">{pick(lang, nameAr, nameEn)}</h1>
      <h2 className="text-lg font-semibold">{t("unavailable.title")}</h2>
      <p>{t("unavailable.body")}</p>
    </div>
  );
}
