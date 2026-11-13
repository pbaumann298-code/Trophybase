import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * Öffentliche Creator-Seite: /{locale}/creator/{slug}
 * Claim-Einladungen hängen als ?claim= am selben Pfad.
 */

export function creatorPublicPath(locale, slug) {
  const lang = normalizeLocale(locale);
  const safe = String(slug ?? '').trim().toLowerCase();
  return `/${lang}/creator/${encodeURIComponent(safe)}`;
}

export function parseCreatorPath(pathname = '') {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length !== 3 || parts[1] !== 'creator') return null;
  const locale = String(parts[0] ?? '').toLowerCase();
  if (!SUPPORTED_LOCALES.includes(locale)) return null;
  let slug;
  try {
    slug = decodeURIComponent(parts[2] ?? '').trim().toLowerCase();
  } catch {
    return null;
  }
  if (!slug || slug.includes('/')) return null;
  return { locale, slug };
}
