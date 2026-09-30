import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { buildPrettyGamePath, hardwareToUrlSegment } from './gameSlug';

const SEO_ATTR = 'data-tb-seo';
const ROBOTS_ATTR = 'data-tb-robots';
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

function removeRobotsMeta() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`meta[${ROBOTS_ATTR}]`).forEach((el) => el.remove());
}

/**
 * `noindex, follow`: die Seite selbst gehört nicht in den Index, ihre Links
 * dürfen aber weiter verfolgt werden.
 *
 * Betrifft zwei Fälle: noch nicht freigegebene Guides (halbleere Seiten) und
 * redaktionell ausgenommene Spiele (is_indexable = false, z. B. Quickwins –
 * die sind online und über die Suche auffindbar, nur nicht über Google).
 */
function applyRobotsNoIndex(noIndex) {
  if (typeof document === 'undefined') return;
  removeRobotsMeta();
  if (!noIndex) return;

  const el = document.createElement('meta');
  el.setAttribute(ROBOTS_ATTR, 'true');
  el.name = 'robots';
  el.content = 'noindex, follow';
  document.head.appendChild(el);
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
 *
 * Der robots-Tag wird vor allem anderen gesetzt: Spiele ohne Slug bekommen
 * keine canonical-Links, brauchen aber trotzdem ihr noindex.
 * @param {{ locale: string, hardware?: string, slug?: string, game?: object, noIndex?: boolean }} opts
 */
export function applyGameSeoLinks({ locale, hardware, slug, game, noIndex = false } = {}) {
  if (typeof document === 'undefined') return;

  applyRobotsNoIndex(noIndex);

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

export function applyPathCanonical(path) {
  if (typeof document === 'undefined') return;
  const normalized = path?.startsWith('/') ? path : `/${path || ''}`;
  if (!normalized || normalized === '/') {
    removeSeoLinks();
    return;
  }
  const origin = getCanonicalOrigin().replace(/\/$/, '');
  removeSeoLinks();
  appendLink('canonical', { href: `${origin}${normalized}` });
}

export function clearGameSeoLinks() {
  removeSeoLinks();
  removeRobotsMeta();
}

export { SITE_ORIGIN, getCanonicalOrigin };
