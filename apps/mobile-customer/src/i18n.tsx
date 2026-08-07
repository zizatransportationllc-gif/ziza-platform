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

    "bids.errorTitle": "Error",
    "bids.tlRequested": "Requested",
    "bids.tlOnTheWay": "On the way",
    "bids.tlArrived": "Arrived",
    "bids.tlInProgress": "In progress",
    "bids.tlDone": "Done",
    "bids.ratingTitle": "Rate your professional",
    "bids.ratingThanks": "Thanks for your feedback!",
    "bids.ratingCommentPlaceholder": "Add a comment (optional)…",
    "bids.ratingSending": "Sending…",
    "bids.ratingSubmit": "Submit rating",
    "bids.ratingErrorSubmit": "Couldn't submit rating",
    "bids.errorLoad": "Failed to load bids",
    "bids.selectConfirmTitle": "Select this professional?",
    "bids.selectConfirmBody": "Total {{total}} — your saved card is charged only when the job is done.",
    "bids.cancel": "Cancel",
    "bids.select": "Select",
    "bids.selectedTitle": "Professional Selected",
    "bids.selectedBody": "They've been notified and are on their way. Your card is charged only when the job is done.",
    "bids.ok": "OK",
    "bids.errorSelect": "Failed to select bid",
    "bids.addCardTitle": "Add a payment card",
    "bids.addCardBody": "You need a saved card to select a professional.",
    "bids.notNow": "Not now",
    "bids.addCardBtn": "Add a card",
    "bids.shareLinkError": "Couldn't create the share link.",
    "bids.shareMessage": "Follow my ZIZA roadside assistance live: {{url}}",
    "bids.cancelRequestTitle": "Cancel request",
    "bids.cancelRequestBody": "Cancel this assistance request?",
    "bids.keepIt": "Keep it",
    "bids.errorCancelRequest": "Couldn't cancel the request.",
    "bids.errorAction": "Action failed",
    "bids.errorPayment": "Payment failed",
    "bids.yourProfessionalCaps": "YOUR PROFESSIONAL",
    "bids.statusOnTheWayEta": "🚗 On the way — ~{{eta}} min away",
    "bids.statusOnSite": "📍 On site",
    "bids.statusJobDone": "✅ Job done",
    "bids.statusWorking": "🔧 Working on it",
    "bids.waitingPosition": "🛰️ Waiting for the professional's live position…",
    "bids.shareLiveTracking": "🔗 Share live tracking",
    "bids.verificationCodeCaps": "🔐 VERIFICATION CODE",
    "bids.confirmArrived": "✅ Confirm the professional has arrived",
    "bids.confirmFinished": "✅ Confirm the work is finished",
    "bids.photosTitle": "📷 Photos from your professional",
    "bids.paymentConfirmed": "✅ Payment confirmed",
    "bids.paymentAutoCharge": "💳 Charged automatically to your saved card.",
    "bids.cancelRequestBtn": "✕ Cancel this request",
    "bids.sortBy": "Sort by",
    "bids.sortRecommended": "Recommended",
    "bids.sortPrice": "Price",
    "bids.sortEta": "ETA",
    "bids.sortRating": "Rating",
    "bids.waitingOffers": "⏳ Waiting for nearby professionals to send their offers…",
    "bids.noneReceived": "No bids received yet.",
    "bids.selectedBanner": "✓ Selected",
    "bids.defaultProName": "Professional",
    "bids.topRated": "🏅 Top rated",
    "bids.ratingOne": "★ {{rating}} · 1 rating",
    "bids.ratingMany": "★ {{rating}} · {{count}} ratings",
    "bids.noRatings": "No ratings yet",
    "bids.etaMin": "⏱ {{eta}} min",
    "bids.youPay": "You pay {{total}}",
    "bids.feeNote": "{{price}} bid + {{fee}} service fee",
    "bids.taxAmount": " + {{tax}} tax",
    "bids.distanceFromYou": "📏 {{miles}} mi from you",
    "bids.bidAt": "Bid at: {{date}}",
    "bids.selectThisProfessional": "Select This Professional",
    "bids.acceptedShort": "✓ Accepted",
    "bids.notSelected": "✗ Not selected",
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

    "bids.errorTitle": "Error",
    "bids.tlRequested": "Solicitado",
    "bids.tlOnTheWay": "En camino",
    "bids.tlArrived": "Llegó",
    "bids.tlInProgress": "En progreso",
    "bids.tlDone": "Terminado",
    "bids.ratingTitle": "Califica a tu profesional",
    "bids.ratingThanks": "¡Gracias por tu opinión!",
    "bids.ratingCommentPlaceholder": "Agrega un comentario (opcional)…",
    "bids.ratingSending": "Enviando…",
    "bids.ratingSubmit": "Enviar calificación",
    "bids.ratingErrorSubmit": "No se pudo enviar la calificación",
    "bids.errorLoad": "No se pudieron cargar las ofertas",
    "bids.selectConfirmTitle": "¿Seleccionar a este profesional?",
    "bids.selectConfirmBody": "Total {{total}} — tu tarjeta guardada se cobra solo cuando el trabajo esté terminado.",
    "bids.cancel": "Cancelar",
    "bids.select": "Seleccionar",
    "bids.selectedTitle": "Profesional seleccionado",
    "bids.selectedBody": "Ha sido notificado y está en camino. Tu tarjeta se cobra solo cuando el trabajo esté terminado.",
    "bids.ok": "Aceptar",
    "bids.errorSelect": "No se pudo seleccionar la oferta",
    "bids.addCardTitle": "Agregar una tarjeta de pago",
    "bids.addCardBody": "Necesitas una tarjeta guardada para seleccionar a un profesional.",
    "bids.notNow": "Ahora no",
    "bids.addCardBtn": "Agregar tarjeta",
    "bids.shareLinkError": "No se pudo crear el enlace para compartir.",
    "bids.shareMessage": "Sigue mi asistencia en carretera ZIZA en vivo: {{url}}",
    "bids.cancelRequestTitle": "Cancelar solicitud",
    "bids.cancelRequestBody": "¿Cancelar esta solicitud de asistencia?",
    "bids.keepIt": "Conservarla",
    "bids.errorCancelRequest": "No se pudo cancelar la solicitud.",
    "bids.errorAction": "La acción falló",
    "bids.errorPayment": "El pago falló",
    "bids.yourProfessionalCaps": "TU PROFESIONAL",
    "bids.statusOnTheWayEta": "🚗 En camino — ~{{eta}} min de distancia",
    "bids.statusOnSite": "📍 En el lugar",
    "bids.statusJobDone": "✅ Trabajo terminado",
    "bids.statusWorking": "🔧 Trabajando en ello",
    "bids.waitingPosition": "🛰️ Esperando la posición en vivo del profesional…",
    "bids.shareLiveTracking": "🔗 Compartir seguimiento en vivo",
    "bids.verificationCodeCaps": "🔐 CÓDIGO DE VERIFICACIÓN",
    "bids.confirmArrived": "✅ Confirmar que el profesional ha llegado",
    "bids.confirmFinished": "✅ Confirmar que el trabajo está terminado",
    "bids.photosTitle": "📷 Fotos de tu profesional",
    "bids.paymentConfirmed": "✅ Pago confirmado",
    "bids.paymentAutoCharge": "💳 Se cobra automáticamente a tu tarjeta guardada.",
    "bids.cancelRequestBtn": "✕ Cancelar esta solicitud",
    "bids.sortBy": "Ordenar por",
    "bids.sortRecommended": "Recomendado",
    "bids.sortPrice": "Precio",
    "bids.sortEta": "Tiempo",
    "bids.sortRating": "Calificación",
    "bids.waitingOffers": "⏳ Esperando que los profesionales cercanos envíen sus ofertas…",
    "bids.noneReceived": "Aún no se han recibido ofertas.",
    "bids.selectedBanner": "✓ Seleccionado",
    "bids.defaultProName": "Profesional",
    "bids.topRated": "🏅 Mejor calificado",
    "bids.ratingOne": "★ {{rating}} · 1 calificación",
    "bids.ratingMany": "★ {{rating}} · {{count}} calificaciones",
    "bids.noRatings": "Aún sin calificaciones",
    "bids.etaMin": "⏱ {{eta}} min",
    "bids.youPay": "Pagas {{total}}",
    "bids.feeNote": "{{price}} oferta + {{fee}} tarifa de servicio",
    "bids.taxAmount": " + {{tax}} impuesto",
    "bids.distanceFromYou": "📏 {{miles}} mi de ti",
    "bids.bidAt": "Oferta enviada: {{date}}",
    "bids.selectThisProfessional": "Seleccionar este profesional",
    "bids.acceptedShort": "✓ Aceptada",
    "bids.notSelected": "✗ No seleccionada",
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
