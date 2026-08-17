import { normalizeLocale } from './locale';

/**
 * Stufe 3: Guide-Zielsprache — Override schlägt globales Website-Locale.
 * @param {string|null|undefined} globalLang
 * @param {string|null|undefined} overrideLang
 */
export function resolveGuideLanguage(globalLang, overrideLang) {
  if (overrideLang != null && String(overrideLang).trim() !== '') {
    return normalizeLocale(overrideLang);
  }
  return normalizeLocale(globalLang);
}
