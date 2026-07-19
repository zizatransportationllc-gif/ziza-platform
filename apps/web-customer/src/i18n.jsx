/**
 * i18n — lightweight in-app translations (English + Spanish) for web-customer.
 *
 * No external library (frontend-isolation rule): a plain dictionary + a context.
 * Language is persisted in localStorage and defaults to the browser language.
 * Expand the dictionaries incrementally as more surfaces are translated;
 * `t(key)` falls back to the key so untranslated strings never break the UI.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ziza_lang";

export const translations = {
  en: {
    "nav.ride": "Ride",
    "nav.assistance": "Assistance",
    "nav.activity": "Activity",
    "nav.account": "Account",

    "account.title": "Account",
    "account.profile": "Profile",
    "account.cards": "Payment Methods",
    "account.docs": "My Documents",
    "account.places": "Saved Places",
    "account.becomeDriver": "Become a Driver",
    "account.language": "Language",
    "account.back": "Account",

    "login.tagline": "Roadside assistance, on demand.",
    "login.signIn": "Sign In",
    "login.signUp": "Sign Up",
  },
  es: {
    "nav.ride": "Viaje",
    "nav.assistance": "Asistencia",
    "nav.activity": "Actividad",
    "nav.account": "Cuenta",

    "account.title": "Cuenta",
    "account.profile": "Perfil",
    "account.cards": "Métodos de pago",
    "account.docs": "Mis documentos",
    "account.places": "Lugares guardados",
    "account.becomeDriver": "Conviértete en conductor",
    "account.language": "Idioma",
    "account.back": "Cuenta",

    "login.tagline": "Asistencia en carretera, cuando la necesites.",
    "login.signIn": "Iniciar sesión",
    "login.signUp": "Registrarse",
  },
};

function initialLang() {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "es") return saved;
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang: setLangState,
    t: (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
  }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  return useContext(LanguageContext);
}
