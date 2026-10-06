import { hreflangOf } from '../../shared/countryLocaleMap.js';
import { buildPrettyGamePath, hardwareToUrlSegment } from './gameSlug';
import {
  SITE_NAME,
  HOME_META_TITLE,
  buildGameSeo,
  hreflangCluster,
} from './gameSeo';

const SEO_ATTR = 'data-tb-seo';
const ROBOTS_ATTR = 'data-tb-robots';
const SEO_META_ATTR = 'data-tb-seo-meta';
const JSON_LD_ATTR = 'data-tb-jsonld';
const SEO_TITLE_ATTR = 'data-tb-seo-title';
const HOME_SEO_ATTR = 'data-tb-home-seo';
const SITE_ORIGIN = 'https://trophybase.app';

/** Klone der Startseiten-SEO-Tags aus index.html, damit Guide-OG sie nicht überlagert. */
let homeSeoStash = [];

function stashHomeSeo() {
  if (typeof document === 'undefined') return;
  const nodes = document.querySelectorAll(`[${HOME_SEO_ATTR}]`);
  if (!nodes.length) return;
  homeSeoStash = [...nodes].map((el) => el.cloneNode(true));
  nodes.forEach((el) => el.remove());
}

function restoreHomeSeo() {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`[${HOME_SEO_ATTR}]`)) return;
  homeSeoStash.forEach((el) => document.head.appendChild(el.cloneNode(true)));
}

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

function removeSeoMeta() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`meta[${SEO_META_ATTR}]`).forEach((el) => el.remove());
  document.querySelectorAll(`script[${JSON_LD_ATTR}]`).forEach((el) => el.remove());
}

function restoreDefaultTitle() {
  if (typeof document === 'undefined') return;
  if (document.head.getAttribute(SEO_TITLE_ATTR) === 'true') {
    document.title = HOME_META_TITLE;
    document.head.removeAttribute(SEO_TITLE_ATTR);
  }
}

function setDocumentTitle(title) {
  if (typeof document === 'undefined') return;
  document.title = title;
  document.head.setAttribute(SEO_TITLE_ATTR, 'true');
}

/**
 * `noindex, follow`: die Seite selbst gehört nicht in den Index, ihre Links
 * dürfen aber weiter verfolgt werden.
 *
 * Betrifft zwei Fälle: noch nicht freigegebene Guides (halbleere Seiten) und
 * redaktionell ausgenommene Spiele (is_indexable = false, z. B. Quickwins –
 * die sind online und über die Website-Suche auffindbar, nur nicht über Google).
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

function appendMeta(attrs) {
  const el = document.createElement('meta');
  el.setAttribute(SEO_META_ATTR, 'true');
  for (const [key, value] of Object.entries(attrs)) {
    if (value) el.setAttribute(key, value);
  }
  document.head.appendChild(el);
}

function appendJsonLd(data) {
  if (!data) return;
  const el = document.createElement('script');
  el.setAttribute(JSON_LD_ATTR, 'true');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

function applyShareMeta({ title, description, url, image, ogLocale, type = 'website' }) {
  appendMeta({ name: 'description', content: description });
  appendMeta({ property: 'og:site_name', content: SITE_NAME });
  appendMeta({ property: 'og:type', content: type });
  appendMeta({ property: 'og:title', content: title });
  appendMeta({ property: 'og:description', content: description });
  if (url) appendMeta({ property: 'og:url', content: url });
  if (image) {
    appendMeta({ property: 'og:image', content: image });
    appendMeta({ name: 'twitter:card', content: 'summary_large_image' });
    appendMeta({ name: 'twitter:image', content: image });
  } else {
    appendMeta({ name: 'twitter:card', content: 'summary' });
  }
  if (ogLocale) appendMeta({ property: 'og:locale', content: ogLocale });
  appendMeta({ name: 'twitter:title', content: title });
  appendMeta({ name: 'twitter:description', content: description });
}

/**
 * canonical zeigt strikt auf die aufgerufene Sprach-URL.
 * hreflang erst, wenn mindestens zwei Sprachen freigegeben sind.
 *
 * Der robots-Tag wird vor allem anderen gesetzt: Spiele ohne Slug bekommen
 * keine canonical-Links, brauchen aber trotzdem ihr noindex.
 * @param {{ locale: string, hardware?: string, slug?: string, game?: object, noIndex?: boolean, locales?: string[] }} opts
 */
export function applyGameSeoLinks({ locale, hardware, slug, game, noIndex = false, locales } = {}) {
  if (typeof document === 'undefined') return;

  applyRobotsNoIndex(noIndex);
  removeSeoLinks();
  removeSeoMeta();
  stashHomeSeo();

  const origin = getCanonicalOrigin().replace(/\/$/, '');
  const seo = buildGameSeo({ origin, locale, hardware, slug, game, locales });
  setDocumentTitle(seo.pageTitle);

  if (!seo.canonical) {
    applyShareMeta({
      title: seo.pageTitle,
      description: seo.description,
      url: '',
      image: seo.cover,
      ogLocale: seo.ogLocale,
    });
    return;
  }

  const hw = hardware || hardwareToUrlSegment(game?.hardware);
  const gameSlug = slug || String(game?.slug ?? '').trim();

  appendLink('canonical', { href: seo.canonical });

  const cluster = hreflangCluster(seo.langs);
  if (cluster) {
    for (const lang of cluster.langs) {
      const href = `${origin}${buildPrettyGamePath(lang, hw, gameSlug)}`;
      appendLink('alternate', { hreflang: hreflangOf(lang), href });
    }
    appendLink('alternate', {
      hreflang: 'x-default',
      href: `${origin}${buildPrettyGamePath(cluster.xDefault, hw, gameSlug)}`,
    });
  }

  applyShareMeta({
    title: seo.pageTitle,
    description: seo.description,
    url: seo.canonical,
    image: seo.cover,
    ogLocale: seo.ogLocale,
  });
  appendJsonLd(seo.jsonLd);
}

export function applyHomeSeo() {
  if (typeof document === 'undefined') return;
  applyRobotsNoIndex(false);
  removeSeoLinks();
  removeSeoMeta();
  restoreHomeSeo();
  setDocumentTitle(HOME_META_TITLE);
}

export function applyPathCanonical(path, { noIndex = false } = {}) {
  if (typeof document === 'undefined') return;
  const normalized = path?.startsWith('/') ? path : `/${path || ''}`;
  applyRobotsNoIndex(noIndex);
  stashHomeSeo();
  if (!normalized || normalized === '/') {
    removeSeoLinks();
    removeSeoMeta();
    restoreHomeSeo();
    return;
  }
  const origin = getCanonicalOrigin().replace(/\/$/, '');
  removeSeoLinks();
  removeSeoMeta();
  appendLink('canonical', { href: `${origin}${normalized}` });
}

export function clearGameSeoLinks() {
  removeSeoLinks();
  removeRobotsMeta();
  removeSeoMeta();
  restoreHomeSeo();
  restoreDefaultTitle();
}

export { SITE_ORIGIN, getCanonicalOrigin };
