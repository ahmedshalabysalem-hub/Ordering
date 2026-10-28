import { formatMoney } from "@/server/money";
import { ar } from "./ar";
import { en, type MessageKey } from "./en";

// Customer language helpers (ADR-013). Pure, so both server and client components use them.

export type Lang = "ar" | "en";
export type { MessageKey };

export const LANG_COOKIE = "lang";
export const LANGS: readonly Lang[] = ["ar", "en"];
export const isLang = (v: unknown): v is Lang => v === "ar" || v === "en";
export const dirOf = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

const dictionaries: Record<Lang, Record<MessageKey, string>> = { ar, en };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(lang: Lang): Translate {
  const dict = dictionaries[lang];
  return (key, vars) => dict[key].replace(/\{(\w+)\}/g, (match, name: string) => (vars && name in vars ? String(vars[name]) : match));
}

/** Picks the field for the language, falling back to the other language when it is empty (SPEC §6.2). */
export function pick(lang: Lang, arText: string | null | undefined, enText: string | null | undefined): string {
  const [first, second] = lang === "ar" ? [arText, enText] : [enText, arText];
  return first?.trim() ? first : (second ?? "");
}

/** Western digits in both languages, to match printed menus and receipts (ADR-013). */
export const numberLocale = (lang: Lang) => (lang === "ar" ? "ar-EG-u-nu-latn" : "en");

export const money = (lang: Lang, minor: number, currency: string) => formatMoney(minor, currency, numberLocale(lang));
