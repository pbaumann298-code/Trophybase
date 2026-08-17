export const LOCALE_COOKIE_KEY = 'tb_locale';
export const LOCALE_COOKIE_MAX_AGE_DAYS = 365;

export function getLocaleCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE_KEY}=([^;]*)`),
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function setLocaleCookie(locale) {
  if (typeof document === 'undefined') return;
  const maxAge = LOCALE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE_KEY}=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearLocaleCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
