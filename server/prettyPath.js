import { SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { URL_HARDWARE_SEGMENTS } from '../src/lib/gameSlug.js';

const PRETTY_PATH = /^\/(de|en|es)\/(ps5|ps4|ps3|psvita|psp)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function parsePrettyGuidePath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const match = PRETTY_PATH.exec(trimmed);
  if (!match) return null;
  const locale = match[1];
  const hardware = match[2];
  const slug = match[3];
  if (!SUPPORTED_LOCALES.includes(locale)) return null;
  if (!URL_HARDWARE_SEGMENTS.includes(hardware)) return null;
  return { locale, hardware, slug };
}

export function parseSitemapLocale(pathname = '', search = '') {
  const path = String(pathname || '').split('?')[0];
  if (path === '/sitemap.xml') return { kind: 'index', locale: null };
  const file = /^\/sitemap-(de|en|es)\.xml$/.exec(path);
  if (file) return { kind: 'locale', locale: file[1] };
  const fromQuery = new URLSearchParams(search).get('locale');
  if (fromQuery && SUPPORTED_LOCALES.includes(fromQuery)) {
    return { kind: 'locale', locale: fromQuery };
  }
  return { kind: 'index', locale: null };
}
