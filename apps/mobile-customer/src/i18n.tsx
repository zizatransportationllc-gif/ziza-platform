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

    "login.signIn": "Sign In",
    "login.createAccount": "Create Account",
    "login.emailPlaceholder": "Email",
    "login.passwordPlaceholder": "Password",
    "login.showPassword": "Show password",
    "login.forgotPassword": "Forgot password?",
    "login.firstNamePlaceholder": "First name",
    "login.lastNamePlaceholder": "Last name",
    "login.birthDatePlaceholder": "Date of birth (YYYY-MM-DD)",
    "login.emailAddressPlaceholder": "Email address",
    "login.passwordMinPlaceholder": "Password (min. 6 characters)",
    "login.confirmPasswordPlaceholder": "Confirm password",
    "login.phonePlaceholder": "Phone number (optional)",
    "login.errorEmailRequired": "Email is required",
    "login.errorFirstNameRequired": "First name is required",
    "login.errorLastNameRequired": "Last name is required",
    "login.errorBirthDateRequired": "Date of birth is required (YYYY-MM-DD)",
    "login.errorPasswordsMismatch": "Passwords do not match",
    "login.errorPasswordTooShort": "Password must be at least 6 characters",
    "login.forgotTitle": "Forgot password",
    "login.forgotEmailFirst": "Enter your email above first.",
    "login.resetSentTitle": "Password reset",
    "login.resetSent": "A reset email has been sent — check your inbox.",
    "login.resetError": "Could not send reset email.",
    "login.errorTitle": "Error",
    "login.loginFailedDefault": "Login failed",
    "login.signupFailedDefault": "Sign-up failed",
    "login.verifyNotice": "Please verify your email. We sent a link to {{email}} — tap it, then sign in.",

    "assistance.category.breakdown": "Breakdown",
    "assistance.category.flat_tyre": "Flat Tire",
    "assistance.category.tow": "Towing",
    "assistance.category.fuel": "Out of Fuel",
    "assistance.category.lockout": "Lockout",
    "assistance.category.battery": "Dead Battery",
    "assistance.category.accident": "Post-Accident",
    "assistance.category.diagnostics": "Diagnostics",
    "assistance.category.other": "Other",
    "assistance.serviceQ.breakdown.q": "Engine",
    "assistance.serviceQ.breakdown.opt1": "Won't start",
    "assistance.serviceQ.breakdown.opt2": "Starts then stalls",
    "assistance.serviceQ.flat_tyre.q": "Spare tire",
    "assistance.serviceQ.flat_tyre.opt1": "Have a spare",
    "assistance.serviceQ.flat_tyre.opt2": "No spare",
    "assistance.serviceQ.tow.q": "Vehicle",
    "assistance.serviceQ.tow.opt1": "Still rolls",
    "assistance.serviceQ.tow.opt2": "Wheels locked",
    "assistance.serviceQ.fuel.q": "Fuel type",
    "assistance.serviceQ.fuel.opt1": "Gas",
    "assistance.serviceQ.fuel.opt2": "Diesel",
    "assistance.serviceQ.lockout.q": "Keys",
    "assistance.serviceQ.lockout.opt1": "Locked inside",
    "assistance.serviceQ.lockout.opt2": "Lost",
    "assistance.serviceQ.battery.q": "Need",
    "assistance.serviceQ.battery.opt1": "Jump start",
    "assistance.serviceQ.battery.opt2": "Replacement",
    "assistance.form.title": "Request Roadside Help",
    "assistance.form.subtitle": "Roadside assistance",
    "assistance.form.typeOfIssue": "Type of Issue",
    "assistance.form.describeIssue": "Describe the issue",
    "assistance.form.descriptionPlaceholder": "e.g. Car won't start, clicking noise when turning key...",
    "assistance.form.yourLocation": "Your location",
    "assistance.form.searchAddress": "Search your address…",
    "assistance.form.orDivider": "or",
    "assistance.form.gpsButton": "📍 Use my GPS location",
    "assistance.form.biddingWindow": "Bidding window (minutes)",
    "assistance.form.postRequest": "Post Request",
    "assistance.form.permissionDeniedTitle": "Permission denied",
    "assistance.form.permissionDeniedBody": "Location permission is required.",
    "assistance.form.errorGetLocation": "Failed to get location",
    "assistance.form.errorSubmit": "Failed to submit request",
    "assistance.form.requestSubmittedTitle": "Request Submitted",
    "assistance.form.requestSubmittedBody": "Your {{category}} request has been posted. Professionals can now bid for {{minutes}} minutes.",
    "assistance.form.trackBids": "Track bids",
    "assistance.list.newRequest": "+ New Request",
    "assistance.list.empty": "No craft requests yet.",
    "assistance.list.postFirst": "Post Your First Request",
    "assistance.list.viewBids": "View Bids →",
    "assistance.list.viewDetails": "View Details →",
    "assistance.list.biddingUntil": "⏱ Bidding until: {{time}}",
    "assistance.list.biddingClosed": "⏰ Bidding window closed",
    "assistance.list.posted": "Posted: {{date}}",
    "assistance.list.errorLoad": "Failed to load requests",
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

    "login.signIn": "Iniciar sesión",
    "login.createAccount": "Crear cuenta",
    "login.emailPlaceholder": "Correo electrónico",
    "login.passwordPlaceholder": "Contraseña",
    "login.showPassword": "Mostrar contraseña",
    "login.forgotPassword": "¿Olvidaste tu contraseña?",
    "login.firstNamePlaceholder": "Nombre",
    "login.lastNamePlaceholder": "Apellido",
    "login.birthDatePlaceholder": "Fecha de nacimiento (AAAA-MM-DD)",
    "login.emailAddressPlaceholder": "Correo electrónico",
    "login.passwordMinPlaceholder": "Contraseña (mín. 6 caracteres)",
    "login.confirmPasswordPlaceholder": "Confirmar contraseña",
    "login.phonePlaceholder": "Número de teléfono (opcional)",
    "login.errorEmailRequired": "El correo electrónico es obligatorio",
    "login.errorFirstNameRequired": "El nombre es obligatorio",
    "login.errorLastNameRequired": "El apellido es obligatorio",
    "login.errorBirthDateRequired": "La fecha de nacimiento es obligatoria (AAAA-MM-DD)",
    "login.errorPasswordsMismatch": "Las contraseñas no coinciden",
    "login.errorPasswordTooShort": "La contraseña debe tener al menos 6 caracteres",
    "login.forgotTitle": "Olvidaste tu contraseña",
    "login.forgotEmailFirst": "Ingresa tu correo electrónico arriba primero.",
    "login.resetSentTitle": "Restablecer contraseña",
    "login.resetSent": "Se ha enviado un correo de restablecimiento — revisa tu bandeja de entrada.",
    "login.resetError": "No se pudo enviar el correo de restablecimiento.",
    "login.errorTitle": "Error",
    "login.loginFailedDefault": "Error al iniciar sesión",
    "login.signupFailedDefault": "Error al crear la cuenta",
    "login.verifyNotice": "Verifica tu correo electrónico. Te enviamos un enlace a {{email}} — tócalo y luego inicia sesión.",

    "assistance.category.breakdown": "Avería",
    "assistance.category.flat_tyre": "Neumático pinchado",
    "assistance.category.tow": "Remolque",
    "assistance.category.fuel": "Sin combustible",
    "assistance.category.lockout": "Llaves bloqueadas",
    "assistance.category.battery": "Batería descargada",
    "assistance.category.accident": "Después de un accidente",
    "assistance.category.diagnostics": "Diagnóstico",
    "assistance.category.other": "Otro",
    "assistance.serviceQ.breakdown.q": "Motor",
    "assistance.serviceQ.breakdown.opt1": "No arranca",
    "assistance.serviceQ.breakdown.opt2": "Arranca y luego se apaga",
    "assistance.serviceQ.flat_tyre.q": "Neumático de repuesto",
    "assistance.serviceQ.flat_tyre.opt1": "Tengo uno de repuesto",
    "assistance.serviceQ.flat_tyre.opt2": "No tengo repuesto",
    "assistance.serviceQ.tow.q": "Vehículo",
    "assistance.serviceQ.tow.opt1": "Aún rueda",
    "assistance.serviceQ.tow.opt2": "Ruedas bloqueadas",
    "assistance.serviceQ.fuel.q": "Tipo de combustible",
    "assistance.serviceQ.fuel.opt1": "Gasolina",
    "assistance.serviceQ.fuel.opt2": "Diésel",
    "assistance.serviceQ.lockout.q": "Llaves",
    "assistance.serviceQ.lockout.opt1": "Encerradas dentro",
    "assistance.serviceQ.lockout.opt2": "Perdidas",
    "assistance.serviceQ.battery.q": "Necesitas",
    "assistance.serviceQ.battery.opt1": "Arranque con cables",
    "assistance.serviceQ.battery.opt2": "Reemplazo",
    "assistance.form.title": "Solicitar asistencia en carretera",
    "assistance.form.subtitle": "Asistencia en carretera",
    "assistance.form.typeOfIssue": "Tipo de problema",
    "assistance.form.describeIssue": "Describe el problema",
    "assistance.form.descriptionPlaceholder": "ej. El auto no arranca, ruido al girar la llave...",
    "assistance.form.yourLocation": "Tu ubicación",
    "assistance.form.searchAddress": "Busca tu dirección…",
    "assistance.form.orDivider": "o",
    "assistance.form.gpsButton": "📍 Usar mi ubicación GPS",
    "assistance.form.biddingWindow": "Ventana de ofertas (minutos)",
    "assistance.form.postRequest": "Publicar solicitud",
    "assistance.form.permissionDeniedTitle": "Permiso denegado",
    "assistance.form.permissionDeniedBody": "Se requiere permiso de ubicación.",
    "assistance.form.errorGetLocation": "No se pudo obtener la ubicación",
    "assistance.form.errorSubmit": "No se pudo enviar la solicitud",
    "assistance.form.requestSubmittedTitle": "Solicitud enviada",
    "assistance.form.requestSubmittedBody": "Tu solicitud de {{category}} ha sido publicada. Los profesionales pueden ofertar durante {{minutes}} minutos.",
    "assistance.form.trackBids": "Ver ofertas",
    "assistance.list.newRequest": "+ Nueva solicitud",
    "assistance.list.empty": "Aún no hay solicitudes de asistencia.",
    "assistance.list.postFirst": "Publica tu primera solicitud",
    "assistance.list.viewBids": "Ver ofertas →",
    "assistance.list.viewDetails": "Ver detalles →",
    "assistance.list.biddingUntil": "⏱ Ofertas hasta: {{time}}",
    "assistance.list.biddingClosed": "⏰ Ventana de ofertas cerrada",
    "assistance.list.posted": "Publicado: {{date}}",
    "assistance.list.errorLoad": "No se pudieron cargar las solicitudes",
  },
};

type TParams = Record<string, string | number>;

// Substitutes {{token}} placeholders in a translated string with values from
// `params`. Unknown/missing tokens are left as-is (never throws, matches the
// existing "never break the UI" fallback philosophy).
export function interpolate(str: string, params?: TParams): string {
  if (!params) return str;
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : match
  );
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: TParams) => string;
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
    t: (key: string, params?: TParams) => interpolate(translations[lang]?.[key] ?? translations.en[key] ?? key, params),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
