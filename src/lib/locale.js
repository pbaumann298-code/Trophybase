import { getLocaleCookie, setLocaleCookie, LOCALE_COOKIE_KEY } from './localeCookies';
import {
  DEFAULT_LOCALE as SHARED_DEFAULT,
  SUPPORTED_LOCALES as SHARED_SUPPORTED,
  normalizeLocale as sharedNormalizeLocale,
} from '../../shared/countryLocaleMap.js';
import { fetchGeoLocale } from './geoLocale';

export const SUPPORTED_LOCALES = SHARED_SUPPORTED;
export const DEFAULT_LOCALE = SHARED_DEFAULT;
export const LOCALE_STORAGE_KEY = 'tb_locale';
export { LOCALE_COOKIE_KEY };
export const LOCALE_COOKIE_MAX_AGE_DAYS = 365;
export const LOCALE_CHANGE_EVENT = 'tb_locale_change';

export function normalizeLocale(value) {
  return sharedNormalizeLocale(value);
}

/** Liefert de/en/es nur wenn der Browser eine unterstützte Sprache meldet. */
export function detectExplicitBrowserLanguage() {
  if (typeof navigator === 'undefined') return null;

  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const entry of candidates) {
    if (!entry) continue;
    const code = entry.split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(code)) return code;
  }

  return null;
}

/** Accept-Language / navigator — synchroner Fallback */
export function detectBrowserLanguage() {
  return detectExplicitBrowserLanguage() ?? DEFAULT_LOCALE;
}

/**
 * Erster Besuch ohne Cookie: Browser (wenn unterstützt) → Geo-IP → en
 * @returns {Promise<string>}
 */
export async function resolveAutoLocale() {
  const explicitBrowser = detectExplicitBrowserLanguage();
  if (explicitBrowser) return explicitBrowser;

  const geoLocale = await fetchGeoLocale();
  if (geoLocale) return geoLocale;

  return DEFAULT_LOCALE;
}

/** Cookie oder localStorage, falls gesetzt. */
export function getPersistedLocale() {
  const fromCookie = getLocaleCookie();
  if (fromCookie) return normalizeLocale(fromCookie);

  try {
    const fromStorage = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (fromStorage) return normalizeLocale(fromStorage);
  } catch {
    /* ignore */
  }

  return null;
}

function syncPersistedLocale(locale) {
  setLocaleCookie(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

/** Synchroner Startwert für den ersten Render (persistiert oder Browser). */
export function bootstrapGlobalLocaleSync() {
  const persisted = getPersistedLocale();
  if (persisted) {
    syncPersistedLocale(persisted);
    return persisted;
  }

  return detectBrowserLanguage();
}

/**
 * Vollständiger Bootstrap inkl. Geo-IP wenn nichts persistiert ist.
 * @returns {Promise<string>}
 */
export async function bootstrapGlobalLocaleAsync() {
  const persisted = getPersistedLocale();
  if (persisted) {
    syncPersistedLocale(persisted);
    return persisted;
  }

  const resolved = await resolveAutoLocale();
  setLocale(resolved, { skipEvent: true });
  return resolved;
}

/**
 * @deprecated Nutze bootstrapGlobalLocaleSync / bootstrapGlobalLocaleAsync.
 */
export function bootstrapGlobalLocale() {
  return bootstrapGlobalLocaleSync();
}

/** Cookie > localStorage > Browser > en */
export function getLocale() {
  const persisted = getPersistedLocale();
  if (persisted) return persisted;
  return detectBrowserLanguage();
}

export function setLocale(locale, options = {}) {
  const normalized = normalizeLocale(locale);
  setLocaleCookie(normalized);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  if (!options.skipEvent && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale: normalized } }),
    );
  }
  return normalized;
}
