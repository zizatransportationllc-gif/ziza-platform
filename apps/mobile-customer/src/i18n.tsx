/**
 * i18n — lightweight in-app translations (English + Spanish) for mobile-customer.
 *
 * No external library (frontend-isolation rule): a plain dictionary + a context.
 * Language is persisted via AsyncStorage. `t(key)` falls back to the key so
 * untranslated strings never break the UI. Expand the dictionaries as more
 * surfaces are translated (kept in lockstep with web-customer's i18n.jsx).
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ziza_lang";

export type Lang = "en" | "es";

export const translations: Record<Lang, Record<string, string>> = {
  en: {
    "nav.ride": "Ride",
    "nav.assistance": "Assistance",
    "nav.activity": "Activity",
    "nav.account": "Account",

    "account.title": "Account",
    "account.language": "Language",
    "account.profile": "Profile",
    "account.cards": "Payment Methods",
    "account.places": "Saved Places",
    "account.docs": "My Documents",
    "account.becomeDriver": "Become a Driver",
  },
  es: {
    "nav.ride": "Viaje",
    "nav.assistance": "Asistencia",
    "nav.activity": "Actividad",
    "nav.account": "Cuenta",

    "account.title": "Cuenta",
    "account.language": "Idioma",
    "account.profile": "Perfil",
    "account.cards": "Métodos de pago",
    "account.places": "Lugares guardados",
    "account.docs": "Mis documentos",
    "account.becomeDriver": "Conviértete en conductor",
  },
};

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nValue>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "en" || saved === "es") setLangState(saved);
    }).catch(() => {});
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  };

  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang,
    t: (key: string) => translations[lang]?.[key] ?? translations.en[key] ?? key,
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
