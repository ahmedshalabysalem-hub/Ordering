import { cookies } from "next/headers";
import { isLang, type Lang, LANG_COOKIE } from "@/i18n";

/** The customer's language: the `lang` cookie, else the branch default (ADR-013). */
export async function customerLang(fallback: Lang): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : fallback;
}
