"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dirOf, type Lang, LANG_COOKIE, translator, type Translate } from "@/i18n";

// Customer language state (ADR-013). The server picks the first language from the cookie, so the first
// paint is already right; switching is instant because the page holds both languages.

type LangState = { lang: Lang; t: Translate; setLang: (lang: Lang) => void };

const LangContext = createContext<LangState | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState(initial);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ lang, t: translator(lang), setLang }), [lang, setLang]);
  return (
    <LangContext value={value}>
      <div lang={lang} dir={dirOf(lang)} className="flex min-h-full flex-1 flex-col">
        {children}
      </div>
    </LangContext>
  );
}

export function useLang(): LangState {
  const state = useContext(LangContext);
  if (!state) throw new Error("useLang must be used inside LangProvider.");
  return state;
}

export function LangSwitch() {
  const { lang, t, setLang } = useLang();
  const other: Lang = lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={() => setLang(other)}
      aria-label={t("lang.switchLabel")}
      lang={other}
      className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
    >
      {t("lang.switch")}
    </button>
  );
}
