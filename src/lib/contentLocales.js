import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { isGuidePublished, isGuideReady } from './guidePublication.js';

export const DEFAULT_AVAILABLE_LOCALES = [DEFAULT_LOCALE];

/**
 * Sprachen mit eigener Freigabe (status.guide_<lang> = PUBLISHED bzw. FERTIG).
 * EN/ES erscheinen erst, wenn sie selbst veröffentlicht sind – nicht mehr
 * automatisch mit Deutsch.
 */
export function contentLocalesForGame(game, { includeReady = false } = {}) {
  if (!game) return [...DEFAULT_AVAILABLE_LOCALES];
  const found = SUPPORTED_LOCALES.filter((lang) =>
    includeReady ? isGuideReady(game, lang) : isGuidePublished(game, lang),
  );
  return found.length > 0 ? found : [...DEFAULT_AVAILABLE_LOCALES];
}

export function coerceToAvailableLocale(locale, available) {
  const list = Array.isArray(available) && available.length > 0 ? available : DEFAULT_AVAILABLE_LOCALES;
  if (list.includes(locale)) return locale;
  if (list.includes(DEFAULT_LOCALE)) return DEFAULT_LOCALE;
  return list[0];
}
