import type { Lang } from "../i18n";

// This is a fixed US/NJ-market product (USD-only) — "es-US" gives Spanish
// month/day names and pluralization while keeping US number/date conventions,
// rather than "es-ES"/"es-MX" which would introduce unrelated regional ones.
export function localeFor(lang: Lang): string {
  return lang === "es" ? "es-US" : "en-US";
}
