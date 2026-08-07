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

    "bids.backToRequests": "← Back to my requests",
    "bids.yourProfessional": "Your professional",
    "bids.statusOnTheWayEta": "🚗 On the way — ~{{eta}} min away",
    "bids.statusOnTheWay": "🚗 On the way",
    "bids.statusOnSite": "📍 On site",
    "bids.statusWorking": "🔧 Working on it",
    "bids.statusJobDone": "✅ Job done",
    "bids.waitingPosition": "🛰️ Waiting for the professional's live position…",
    "bids.shareLiveTracking": "🔗 Share live tracking",
    "bids.shareLinkCopied": "Link copied ✓",
    "bids.shareLinkError": "Couldn't create link",
    "bids.shareTitle": "ZIZA roadside",
    "bids.shareText": "Follow my roadside assistance live",
    "bids.verificationCode": "🔐 Verification code",
    "bids.verificationHint": "Share it with your professional on site.",
    "bids.confirming": "Confirming…",
    "bids.confirmArrived": "✅ Confirm the professional has arrived",
    "bids.confirmFinished": "✅ Confirm the work is finished",
    "bids.photosTitle": "📷 Photos from your professional",
    "bids.photoBefore": "Before",
    "bids.photoAfter": "After",
    "bids.titleNone": "No bids yet",
    "bids.titleOne": "1 bid",
    "bids.titleMany": "{{count}} bids",
    "bids.waitingOffers": "⏳ Waiting for nearby professionals to send their offers…",
    "bids.loading": "⏳ Loading bids…",
    "bids.sortBy": "Sort by",
    "bids.sortRecommended": "Recommended",
    "bids.sortPrice": "Price",
    "bids.sortEta": "ETA",
    "bids.sortRating": "Rating",
    "bids.defaultProName": "Professional",
    "bids.topRated": "🏅 Top rated",
    "bids.ratingOne": "★ {{rating}} · 1 rating",
    "bids.ratingMany": "★ {{rating}} · {{count}} ratings",
    "bids.noRatings": "No ratings yet",
    "bids.etaMin": "⏱ {{eta}} min ETA",
    "bids.distanceAway": "📍 {{miles}} mi away",
    "bids.youPay": "You pay {{total}}",
    "bids.feeNote": "{{price}} bid + {{fee}} service fee",
    "bids.taxAmount": " + {{tax}} tax",
    "bids.accepting": "Accepting…",
    "bids.acceptBid": "✓ Accept this bid",
    "bids.accepted": "✅ You accepted this bid",
    "bids.cancelling": "Cancelling…",
    "bids.cancelRequest": "✕ Cancel this request",
    "bids.payModalTitle": "Confirm your selection",
    "bids.payModalTotal": "Total {{amount}}",
    "bids.payModalHint": "Your saved card is charged only when the professional finishes the job.",
    "bids.payModalCancel": "Cancel",
    "bids.payModalSelecting": "Selecting…",
    "bids.payModalSelect": "Select professional",
    "bids.selectionSuccess": "✅ Professional accepted — they're on their way! Your card is charged when the job is done.",
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

    "bids.backToRequests": "← Volver a mis solicitudes",
    "bids.yourProfessional": "Tu profesional",
    "bids.statusOnTheWayEta": "🚗 En camino — ~{{eta}} min de distancia",
    "bids.statusOnTheWay": "🚗 En camino",
    "bids.statusOnSite": "📍 En el lugar",
    "bids.statusWorking": "🔧 Trabajando en ello",
    "bids.statusJobDone": "✅ Trabajo terminado",
    "bids.waitingPosition": "🛰️ Esperando la posición en vivo del profesional…",
    "bids.shareLiveTracking": "🔗 Compartir seguimiento en vivo",
    "bids.shareLinkCopied": "Enlace copiado ✓",
    "bids.shareLinkError": "No se pudo crear el enlace",
    "bids.shareTitle": "ZIZA en carretera",
    "bids.shareText": "Sigue mi asistencia en carretera en vivo",
    "bids.verificationCode": "🔐 Código de verificación",
    "bids.verificationHint": "Compártelo con tu profesional en el lugar.",
    "bids.confirming": "Confirmando…",
    "bids.confirmArrived": "✅ Confirmar que el profesional ha llegado",
    "bids.confirmFinished": "✅ Confirmar que el trabajo está terminado",
    "bids.photosTitle": "📷 Fotos de tu profesional",
    "bids.photoBefore": "Antes",
    "bids.photoAfter": "Después",
    "bids.titleNone": "Aún no hay ofertas",
    "bids.titleOne": "1 oferta",
    "bids.titleMany": "{{count}} ofertas",
    "bids.waitingOffers": "⏳ Esperando que los profesionales cercanos envíen sus ofertas…",
    "bids.loading": "⏳ Cargando ofertas…",
    "bids.sortBy": "Ordenar por",
    "bids.sortRecommended": "Recomendado",
    "bids.sortPrice": "Precio",
    "bids.sortEta": "Tiempo",
    "bids.sortRating": "Calificación",
    "bids.defaultProName": "Profesional",
    "bids.topRated": "🏅 Mejor calificado",
    "bids.ratingOne": "★ {{rating}} · 1 calificación",
    "bids.ratingMany": "★ {{rating}} · {{count}} calificaciones",
    "bids.noRatings": "Aún sin calificaciones",
    "bids.etaMin": "⏱ {{eta}} min de espera",
    "bids.distanceAway": "📍 {{miles}} mi de distancia",
    "bids.youPay": "Pagas {{total}}",
    "bids.feeNote": "{{price}} oferta + {{fee}} tarifa de servicio",
    "bids.taxAmount": " + {{tax}} impuesto",
    "bids.accepting": "Aceptando…",
    "bids.acceptBid": "✓ Aceptar esta oferta",
    "bids.accepted": "✅ Aceptaste esta oferta",
    "bids.cancelling": "Cancelando…",
    "bids.cancelRequest": "✕ Cancelar esta solicitud",
    "bids.payModalTitle": "Confirma tu selección",
    "bids.payModalTotal": "Total {{amount}}",
    "bids.payModalHint": "Tu tarjeta guardada se cobra solo cuando el profesional termine el trabajo.",
    "bids.payModalCancel": "Cancelar",
    "bids.payModalSelecting": "Seleccionando…",
    "bids.payModalSelect": "Seleccionar profesional",
    "bids.selectionSuccess": "✅ Profesional aceptado — ¡está en camino! Tu tarjeta se cobra cuando el trabajo esté terminado.",
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
