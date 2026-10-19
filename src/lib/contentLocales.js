import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { isGuidePublished, isGuideReady } from './guidePublication.js';

/** Öffentlich wählbare Website-/Guide-Sprachen. Weitere Codes hier ergänzen. */
export const PUBLIC_SITE_LOCALES = ['de', 'en'];

export const DEFAULT_AVAILABLE_LOCALES = PUBLIC_SITE_LOCALES;

/**
 * Sprachen mit eigener Freigabe (status.guide_<lang> = PUBLISHED bzw. FERTIG).
 * Normale Besucher sehen nur PUBLISHED innerhalb von PUBLIC_SITE_LOCALES.
 * Admins (`includeReady`) sehen alle SUPPORTED_LOCALES mit FERTIG/PUBLISHED.
 */
export function contentLocalesForGame(game, { includeReady = false } = {}) {
  if (!game) return [...DEFAULT_AVAILABLE_LOCALES];
  const found = SUPPORTED_LOCALES.filter((lang) =>
    includeReady ? isGuideReady(game, lang) : isGuidePublished(game, lang),
  );
  const scoped = includeReady
    ? found
    : found.filter((lang) => PUBLIC_SITE_LOCALES.includes(lang));
  return scoped.length > 0 ? scoped : [...DEFAULT_AVAILABLE_LOCALES];
}

export function coerceToAvailableLocale(locale, available) {
  const list = Array.isArray(available) && available.length > 0 ? available : DEFAULT_AVAILABLE_LOCALES;
  if (list.includes(locale)) return locale;
  if (list.includes(DEFAULT_LOCALE)) return DEFAULT_LOCALE;
  return list[0];
}
