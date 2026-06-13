export const SUPPORTED_LOCALES = ['de', 'en', 'es'];
export const DEFAULT_LOCALE = 'de';
export const LOCALE_STORAGE_KEY = 'tb_locale';

export function normalizeLocale(value) {
  const raw = String(value ?? DEFAULT_LOCALE).trim().toLowerCase();
  return SUPPORTED_LOCALES.includes(raw) ? raw : DEFAULT_LOCALE;
}

export function getLocale() {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setLocale(locale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale));
}
