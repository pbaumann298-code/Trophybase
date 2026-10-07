import { FALLBACK_LANGUAGE } from './gameSchema.js';
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
 * Mit exact bleibt nur die gewünschte Sprache übrig.
 * @param {Record<string, unknown>} map
 * @param {string} preferred
 * @param {string} fallback
 * @param {boolean} exact
 * @returns {string[]}
 */
function languageCandidates(map, preferred, fallback, exact) {
  if (exact) return preferred ? [preferred] : [];
  const chain = [preferred, PRIMARY_LANGUAGE, fallback, ...SUPPORTED_LOCALES, ...Object.keys(map)];
  return [...new Set(chain.filter(Boolean))];
}

/**
 * Löst eine JSONB-Sprachmap ({ de, en, es }) auf und meldet, welche Sprache
 * tatsächlich benutzt wurde. Das Ergebnis ist immer ein String.
 * @param {unknown} value
 * @param {string} preferredLang
 * @param {string} [fallbackLang]
 * @param {{ exact?: boolean }} [options] exact: kein Sprung auf Deutsch oder andere Sprachen
 * @returns {{ text: string, locale: string, usedFallback: boolean }}
 */
export function pickLocalized(value, preferredLang, fallbackLang = FALLBACK_LANGUAGE, options = {}) {
  const preferred = String(preferredLang ?? '').toLowerCase();
  const fallback = String(fallbackLang ?? '').toLowerCase();
  const exact = options?.exact === true;
  const empty = { text: '', locale: preferred || fallback, usedFallback: false };

  if (value == null) return empty;

  // Nicht lokalisierte Altdaten: reiner Text statt Sprachmap
  if (typeof value === 'string' || typeof value === 'number') {
    return { text: asText(value), locale: preferred || fallback, usedFallback: false };
  }

  if (typeof value !== 'object' || Array.isArray(value)) return empty;

  const map = /** @type {Record<string, unknown>} */ (value);

  for (const candidate of languageCandidates(map, preferred, fallback, exact)) {
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
 * @param {{ exact?: boolean }} [options]
 * @returns {string}
 */
export function localizeJsonField(value, preferredLang, fallbackLang = FALLBACK_LANGUAGE, options) {
  return pickLocalized(value, preferredLang, fallbackLang, options).text;
}

/**
 * Sony-Trophäentext: gewünschte Sprache, sonst das englische Original.
 * Kein Sprung auf Deutsch oder weitere Sprachen.
 * @param {unknown} value
 * @param {string} locale
 * @returns {string}
 */
export function localizeSonyDescription(value, locale) {
  const lang = String(locale ?? '').toLowerCase();
  const exact = localizeJsonField(value, lang, FALLBACK_LANGUAGE, { exact: true });
  if (exact) return exact;
  if (lang && lang !== 'en') {
    return localizeJsonField(value, 'en', FALLBACK_LANGUAGE, { exact: true });
  }
  return '';
}

/**
 * Text aus ai_translation für genau eine Zielsprache.
 * Erwartet { pl: "…" }, { pl: { trophy_desc: "…" } } oder { trophy_desc: { pl: "…" } }.
 * @param {unknown} value
 * @param {string} locale
 * @returns {string}
 */
export function readAiTranslation(value, locale) {
  const lang = String(locale ?? '').toLowerCase();
  if (!lang || value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object' || Array.isArray(value)) return '';

  const textOf = (entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
    return asText(entry.trophy_desc) || asText(entry.description) || asText(entry.desc) || asText(entry.text);
  };

  const direct = textOf(value[lang]);
  if (direct) return direct;

  const wrapped = value.trophy_desc ?? value.description ?? value.desc;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    return asText(wrapped[lang]);
  }
  return '';
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
