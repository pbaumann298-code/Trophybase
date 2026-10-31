/**
 * Sprachen der Trophy-Dateien (Sony TROPCONF.SFM, Einträge 00–13) plus pl
 * (neuere Trophy-Container; Guides werden per tb_auto_release_locales auch
 * für pl freigegeben). da / no bleiben bewusst draußen.
 *
 * @typedef {'ja'|'en'|'fr'|'es'|'de'|'it'|'nl'|'pt'|'pl'|'ru'|'ko'|'zh-hant'|'zh-hans'|'fi'|'sv'|'ar'} SupportedLocale
 */

export const SUPPORTED_LOCALES = [
  'ja',
  'en',
  'fr',
  'es',
  'de',
  'it',
  'nl',
  'pt',
  'pl',
  'ru',
  'ko',
  'zh-hant',
  'zh-hans',
  'fi',
  'sv',
  'ar',
];

/** Redaktionelle Hauptsprache – solange nur DE veröffentlicht ist. */
export const DEFAULT_LOCALE = 'de';

/** Für Vite/Vercel-Pretty-URLs: de|en|…|zh-hans */
export const LOCALE_PATH_PATTERN = SUPPORTED_LOCALES.join('|');

const LOCALE_ALIASES = {
  'en-us': 'en',
  'en-gb': 'en',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  'zh': 'zh-hans',
  'zh-cn': 'zh-hans',
  'zh-sg': 'zh-hans',
  'zh-hans': 'zh-hans',
  'zh-tw': 'zh-hant',
  'zh-hk': 'zh-hant',
  'zh-mo': 'zh-hant',
  'zh-hant': 'zh-hant',
};

const REGION_TO_LOCALE = {
  JP: 'ja',
  US: 'en',
  GB: 'en',
  AU: 'en',
  NZ: 'en',
  IE: 'en',
  CA: 'en',
  FR: 'fr',
  BE: 'fr',
  MC: 'fr',
  LU: 'de',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  VE: 'es',
  EC: 'es',
  GT: 'es',
  CU: 'es',
  BO: 'es',
  DO: 'es',
  HN: 'es',
  PY: 'es',
  SV: 'es',
  NI: 'es',
  CR: 'es',
  PA: 'es',
  UY: 'es',
  PR: 'es',
  GQ: 'es',
  AD: 'es',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  LI: 'de',
  IT: 'it',
  SM: 'it',
  NL: 'nl',
  SR: 'nl',
  PT: 'pt',
  BR: 'pt',
  AO: 'pt',
  MZ: 'pt',
  CV: 'pt',
  PL: 'pl',
  RU: 'ru',
  BY: 'ru',
  KZ: 'ru',
  KR: 'ko',
  TW: 'zh-hant',
  HK: 'zh-hant',
  MO: 'zh-hant',
  CN: 'zh-hans',
  SG: 'zh-hans',
  FI: 'fi',
  SE: 'sv',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  MA: 'ar',
  DZ: 'ar',
  IQ: 'ar',
  JO: 'ar',
  KW: 'ar',
  LB: 'ar',
  OM: 'ar',
  QA: 'ar',
  BH: 'ar',
  TN: 'ar',
};

/**
 * @param {string} locale
 * @returns {string} hreflang (BCP 47)
 */
export function hreflangOf(locale) {
  if (locale === 'zh-hans') return 'zh-Hans';
  if (locale === 'zh-hant') return 'zh-Hant';
  return locale;
}

/**
 * @param {string|null|undefined} countryCode ISO 3166-1 alpha-2
 * @returns {SupportedLocale|null}
 */
export function countryToLocale(countryCode) {
  const country = String(countryCode ?? '').trim().toUpperCase();
  if (!country) return null;
  return REGION_TO_LOCALE[country] ?? null;
}

/**
 * @param {string|null|undefined} value
 * @returns {SupportedLocale}
 */
export function normalizeLocale(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return DEFAULT_LOCALE;
  const aliased = LOCALE_ALIASES[raw] ?? raw.split('-')[0];
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  if (SUPPORTED_LOCALES.includes(aliased)) return aliased;
  return DEFAULT_LOCALE;
}
