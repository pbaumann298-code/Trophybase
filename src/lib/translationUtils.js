import { FALLBACK_LANGUAGE } from './gameSchema';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';

/**
 * @param {string|null|undefined} preferred
 * @param {string|null|undefined} fallback
 */
export function coalesceText(preferred, fallback) {
  const a = String(preferred ?? '').trim();
  if (a) return a;
  return String(fallback ?? '').trim();
}

/**
 * Löst eine JSONB-Sprachmap ({ de, en, es }) auf und meldet, welche Sprache
 * tatsächlich benutzt wurde.
 * @param {unknown} value
 * @param {string} preferredLang
 * @param {string} [fallbackLang]
 * @returns {{ text: string, locale: string, usedFallback: boolean }}
 */
export function pickLocalized(value, preferredLang, fallbackLang = FALLBACK_LANGUAGE) {
  const preferred = String(preferredLang ?? '').toLowerCase();
  const fallback = String(fallbackLang ?? '').toLowerCase();
  const empty = { text: '', locale: preferred || fallback, usedFallback: false };

  if (value == null) return empty;

  // Nicht lokalisierte Altdaten: reiner Text statt Sprachmap
  if (typeof value === 'string' || typeof value === 'number') {
    return { text: String(value).trim(), locale: preferred || fallback, usedFallback: false };
  }

  if (typeof value !== 'object' || Array.isArray(value)) return empty;

  const map = /** @type {Record<string, unknown>} */ (value);

  const fromPreferred = coalesceText(map[preferred], map[preferredLang]);
  if (fromPreferred) return { text: fromPreferred, locale: preferred, usedFallback: false };

  const fromFallback = coalesceText(map[fallback], map[fallbackLang]);
  if (fromFallback) return { text: fromFallback, locale: fallback, usedFallback: true };

  for (const candidate of SUPPORTED_LOCALES) {
    const text = coalesceText(map[candidate], null);
    if (text) return { text, locale: candidate, usedFallback: true };
  }

  for (const [key, entry] of Object.entries(map)) {
    const text = coalesceText(entry, null);
    if (text) return { text, locale: key, usedFallback: true };
  }

  return empty;
}

/**
 * Kurzform von pickLocalized, wenn nur der Text gebraucht wird.
 * @param {unknown} value
 * @param {string} preferredLang
 * @param {string} [fallbackLang]
 * @returns {string}
 */
export function localizeJsonField(value, preferredLang, fallbackLang = FALLBACK_LANGUAGE) {
  return pickLocalized(value, preferredLang, fallbackLang).text;
}

/**
 * Schreibpfad: einzelne Sprache in einer JSONB-Sprachmap ersetzen, ohne die
 * übrigen Sprachen zu verlieren.
 * @param {unknown} current Bisheriger JSONB-Wert
 * @param {string} lang
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function mergeLocalizedValue(current, lang, text) {
  const language = String(lang ?? '').toLowerCase() || FALLBACK_LANGUAGE;

  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return { ...current, [language]: text };
  }

  // Altdaten als reiner String: als Fallback-Sprache erhalten
  if (typeof current === 'string' && current.trim() && language !== FALLBACK_LANGUAGE) {
    return { [FALLBACK_LANGUAGE]: current.trim(), [language]: text };
  }

  return { [language]: text };
}

/** Erste Zahl aus lokalisierten Werten wie „12,5 %" oder „12.5%". */
export function parsePercentValue(value) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
