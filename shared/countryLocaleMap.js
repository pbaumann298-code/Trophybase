/** @typedef {'de' | 'en' | 'es'} SupportedLocale */

export const SUPPORTED_LOCALES = ['de', 'en', 'es'];
export const DEFAULT_LOCALE = 'en';

const GERMAN_REGIONS = new Set(['DE', 'AT', 'CH', 'LI', 'LU']);
const SPANISH_REGIONS = new Set([
  'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN',
  'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ', 'AD',
]);

/**
 * @param {string|null|undefined} countryCode ISO 3166-1 alpha-2
 * @returns {SupportedLocale|null}
 */
export function countryToLocale(countryCode) {
  const country = String(countryCode ?? '').trim().toUpperCase();
  if (!country) return null;
  if (GERMAN_REGIONS.has(country)) return 'de';
  if (SPANISH_REGIONS.has(country)) return 'es';
  return 'en';
}

/**
 * @param {string|null|undefined} value
 * @returns {SupportedLocale}
 */
export function normalizeLocale(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  return DEFAULT_LOCALE;
}
