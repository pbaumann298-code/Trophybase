import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * „Kurz erklärt“ / „How it works“.
 * Kanonisch nur mit Sprachpräfix: /de/kurz-erklaert, sonst /{locale}/how-it-works.
 * /kurz-erklaert und /how-it-works ohne Präfix sind Legacy.
 */
const DE_SLUG = 'kurz-erklaert';
const EN_SLUG = 'how-it-works';

export const GUIDE_HELP_PAGE = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    { slug: locale === 'de' ? DE_SLUG : EN_SLUG },
  ]),
);

const KNOWN_SLUGS = new Set([DE_SLUG, EN_SLUG]);

export function guideHelpPageCopy(locale) {
  const key = normalizeLocale(locale);
  return GUIDE_HELP_PAGE[key] || GUIDE_HELP_PAGE.de;
}

export function guideHelpPublicPath(locale) {
  const copy = guideHelpPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /{locale}/{slug} sowie Legacy /kurz-erklaert und /how-it-works. */
export function parseGuideHelpPath(pathname = '') {
  const pathOnly = String(pathname || '').split('?')[0].split('#')[0];
  const parts = pathOnly.split('/').filter(Boolean);
  if (parts.length === 1 && KNOWN_SLUGS.has(parts[0])) {
    return { locale: null, slug: parts[0], legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!KNOWN_SLUGS.has(parts[1])) return null;
  return {
    locale: parts[0],
    slug: parts[1],
    legacy: parts[1] !== GUIDE_HELP_PAGE[parts[0]]?.slug,
  };
}
