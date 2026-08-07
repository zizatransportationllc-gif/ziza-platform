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

    "login.signIn": "Sign In",
    "login.signingIn": "Signing in…",
    "login.createAccount": "Create Account",
    "login.creatingAccount": "Creating account…",
    "login.continueWithGoogle": "Continue with Google",
    "login.forgotPassword": "Forgot password?",
    "login.emailPlaceholder": "Email",
    "login.passwordPlaceholder": "Password",
    "login.showPassword": "Show password",
    "login.firstNamePlaceholder": "First name",
    "login.lastNamePlaceholder": "Last name",
    "login.birthDatePlaceholder": "Date of birth",
    "login.emailAddressPlaceholder": "Email address",
    "login.passwordMinPlaceholder": "Password (min. 6 characters)",
    "login.confirmPasswordPlaceholder": "Confirm password",
    "login.phonePlaceholder": "Phone number (optional)",
    "login.errorFirstNameRequired": "First name is required",
    "login.errorLastNameRequired": "Last name is required",
    "login.errorBirthDateRequired": "Date of birth is required",
    "login.errorPasswordsMismatch": "Passwords do not match",
    "login.errorPasswordTooShort": "Password must be at least 6 characters",
    "login.forgotEmailFirst": "Enter your email above, then tap again.",
    "login.resetSent": "Password reset email sent — check your inbox.",
    "login.resetError": "Could not send reset email.",
    "login.verifyNotice": "Please verify your email. We sent a link to {{email}} — click it, then sign in.",

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
    "assistance.form.title": "🔧 Request Roadside Help",
    "assistance.form.cancel": "✕ Cancel",
    "assistance.form.typeOfIssue": "Type of issue",
    "assistance.form.describeIssue": "Describe the issue",
    "assistance.form.descriptionPlaceholder": "e.g. Car won't start, clicking noise when turning key…",
    "assistance.form.yourLocation": "Your location",
    "assistance.form.searchAddress": "Search your address…",
    "assistance.form.detectingGps": "⏳ Detecting your GPS position…",
    "assistance.form.posting": "Posting…",
    "assistance.form.postRequest": "📤 Post Request",
    "assistance.form.errorSelectCategory": "Please select a category.",
    "assistance.form.errorNoLocation": "Add your location — search an address or use GPS.",
    "assistance.form.errorNoGeolocation": "Geolocation not available in this browser.",
    "assistance.form.errorGpsFailed": "Couldn't get your GPS position — search your address instead.",
    "assistance.publicTrackTitle": "{{category}} assistance",
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

    "login.signIn": "Iniciar sesión",
    "login.signingIn": "Iniciando sesión…",
    "login.createAccount": "Crear cuenta",
    "login.creatingAccount": "Creando cuenta…",
    "login.continueWithGoogle": "Continuar con Google",
    "login.forgotPassword": "¿Olvidaste tu contraseña?",
    "login.emailPlaceholder": "Correo electrónico",
    "login.passwordPlaceholder": "Contraseña",
    "login.showPassword": "Mostrar contraseña",
    "login.firstNamePlaceholder": "Nombre",
    "login.lastNamePlaceholder": "Apellido",
    "login.birthDatePlaceholder": "Fecha de nacimiento",
    "login.emailAddressPlaceholder": "Correo electrónico",
    "login.passwordMinPlaceholder": "Contraseña (mín. 6 caracteres)",
    "login.confirmPasswordPlaceholder": "Confirmar contraseña",
    "login.phonePlaceholder": "Número de teléfono (opcional)",
    "login.errorFirstNameRequired": "El nombre es obligatorio",
    "login.errorLastNameRequired": "El apellido es obligatorio",
    "login.errorBirthDateRequired": "La fecha de nacimiento es obligatoria",
    "login.errorPasswordsMismatch": "Las contraseñas no coinciden",
    "login.errorPasswordTooShort": "La contraseña debe tener al menos 6 caracteres",
    "login.forgotEmailFirst": "Ingresa tu correo electrónico arriba y vuelve a intentarlo.",
    "login.resetSent": "Correo de restablecimiento enviado — revisa tu bandeja de entrada.",
    "login.resetError": "No se pudo enviar el correo de restablecimiento.",
    "login.verifyNotice": "Verifica tu correo electrónico. Te enviamos un enlace a {{email}} — haz clic en él y luego inicia sesión.",

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
    "assistance.form.title": "🔧 Solicitar asistencia en carretera",
    "assistance.form.cancel": "✕ Cancelar",
    "assistance.form.typeOfIssue": "Tipo de problema",
    "assistance.form.describeIssue": "Describe el problema",
    "assistance.form.descriptionPlaceholder": "ej. El auto no arranca, ruido al girar la llave…",
    "assistance.form.yourLocation": "Tu ubicación",
    "assistance.form.searchAddress": "Busca tu dirección…",
    "assistance.form.detectingGps": "⏳ Detectando tu posición GPS…",
    "assistance.form.posting": "Enviando…",
    "assistance.form.postRequest": "📤 Publicar solicitud",
    "assistance.form.errorSelectCategory": "Selecciona una categoría.",
    "assistance.form.errorNoLocation": "Agrega tu ubicación — busca una dirección o usa el GPS.",
    "assistance.form.errorNoGeolocation": "Geolocalización no disponible en este navegador.",
    "assistance.form.errorGpsFailed": "No se pudo obtener tu posición GPS — busca tu dirección en su lugar.",
    "assistance.publicTrackTitle": "Asistencia: {{category}}",
  },
};

// Substitutes {{token}} placeholders in a translated string with values from
// `params`. Unknown/missing tokens are left as-is (never throws, matches the
// existing "never break the UI" fallback philosophy).
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : match
  );
}

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
    t: (key, params) => interpolate(translations[lang]?.[key] ?? translations.en[key] ?? key, params),
  }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  return useContext(LanguageContext);
}
