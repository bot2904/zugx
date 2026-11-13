import { createI18n } from "vue-i18n";
import de from "./de.ts";
import en from "./en.ts";
import it from "./it.ts";

export const LOCALES = ["en", "de", "it"] as const;
export type Locale = (typeof LOCALES)[number];

function initialLocale(): Locale {
  const saved = localStorage.getItem("zugx:lang");
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  for (const l of navigator.languages ?? [navigator.language]) {
    const short = l.slice(0, 2) as Locale;
    if (LOCALES.includes(short)) return short;
  }
  return "en";
}

const locale = initialLocale();
document.documentElement.lang = locale;

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: "en",
  messages: { en, de, it },
});

export function setLocale(l: Locale) {
  i18n.global.locale.value = l;
  localStorage.setItem("zugx:lang", l);
  document.documentElement.lang = l;
}

/** HAFAS language code for the current locale */
export const hafasLang = () =>
  ({ en: "eng", de: "deu", it: "ita" } as const)[i18n.global.locale.value as Locale] ?? "deu";
