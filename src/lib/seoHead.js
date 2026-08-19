import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { buildPrettyGamePath, hardwareToUrlSegment } from './gameSlug';

const SEO_ATTR = 'data-tb-seo';
const SITE_ORIGIN = 'https://trophybase.app';

function getCanonicalOrigin() {
  if (typeof window === 'undefined') return SITE_ORIGIN;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return window.location.origin;
  if (host.endsWith('.vercel.app')) return SITE_ORIGIN;
  return window.location.origin || SITE_ORIGIN;
}

function removeSeoLinks() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`link[${SEO_ATTR}]`).forEach((el) => el.remove());
}

function appendLink(rel, extra) {
  const el = document.createElement('link');
  el.setAttribute(SEO_ATTR, 'true');
  el.rel = rel;
  for (const [key, value] of Object.entries(extra)) {
    if (value) el.setAttribute(key, value);
  }
  document.head.appendChild(el);
}

/**
 * canonical zeigt strikt auf die aufgerufene Sprach-URL.
 * hreflang listet de/en/es plus x-default (en).
 * @param {{ locale: string, hardware?: string, slug?: string, game?: object }} opts
 */
export function applyGameSeoLinks({ locale, hardware, slug, game } = {}) {
  if (typeof document === 'undefined') return;

  const hw = hardware || hardwareToUrlSegment(game?.hardware);
  const gameSlug = slug || String(game?.slug ?? '').trim();
  const path = buildPrettyGamePath(locale, hw, gameSlug);
  if (!path) {
    removeSeoLinks();
    return;
  }

  const origin = getCanonicalOrigin().replace(/\/$/, '');
  const canonical = `${origin}${path}`;

  removeSeoLinks();
  appendLink('canonical', { href: canonical });

  for (const lang of SUPPORTED_LOCALES) {
    const href = `${origin}${buildPrettyGamePath(lang, hw, gameSlug)}`;
    appendLink('alternate', { hreflang: lang, href });
  }

  appendLink('alternate', {
    hreflang: 'x-default',
    href: `${origin}${buildPrettyGamePath(DEFAULT_LOCALE, hw, gameSlug)}`,
  });
}

export function clearGameSeoLinks() {
  removeSeoLinks();
}

export { SITE_ORIGIN, getCanonicalOrigin };
