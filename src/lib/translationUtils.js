import { FALLBACK_LANGUAGE } from './gameSchema';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';

/** Primärsprache der Redaktion – vor FALLBACK_LANGUAGE in der Fallback-Kette. */
export const PRIMARY_LANGUAGE = 'de';

/**
 * Nur Skalare gelten als Text. Verschachtelte Objekte/Arrays dürfen niemals
 * über String() zu „[object Object]" werden.
 * @param {unknown} value
 * @returns {string}
 */
export function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Reihenfolge der Sprachkandidaten: gewünschte Sprache → de → en → übrige
 * unterstützte Sprachen → beliebiger vorhandener Schlüssel.
 * @param {Record<string, unknown>} map
 * @param {string} preferred
 * @param {string} fallback
 * @returns {string[]}
 */
function languageCandidates(map, preferred, fallback) {
  const chain = [preferred, PRIMARY_LANGUAGE, fallback, ...SUPPORTED_LOCALES, ...Object.keys(map)];
  return [...new Set(chain.filter(Boolean))];
}

/**
 * Löst eine JSONB-Sprachmap ({ de, en, es }) auf und meldet, welche Sprache
 * tatsächlich benutzt wurde. Das Ergebnis ist immer ein String.
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
    return { text: asText(value), locale: preferred || fallback, usedFallback: false };
  }

  if (typeof value !== 'object' || Array.isArray(value)) return empty;

  const map = /** @type {Record<string, unknown>} */ (value);

  for (const candidate of languageCandidates(map, preferred, fallback)) {
    const text = asText(map[candidate]);
    if (text) {
      return { text, locale: candidate, usedFallback: candidate !== preferred };
    }
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
