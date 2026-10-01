import { LOCALE_PATH_PATTERN, SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { URL_HARDWARE_SEGMENTS } from '../src/lib/gameSlug.js';

const hardwareGroup = URL_HARDWARE_SEGMENTS.join('|');
const PRETTY_PATH = new RegExp(
  `^/(${LOCALE_PATH_PATTERN})/(${hardwareGroup})/([a-z0-9]+(?:-[a-z0-9]+)*)$`,
);
const SITEMAP_FILE = new RegExp(`^/sitemap-(${LOCALE_PATH_PATTERN})\\.xml$`);

export function parsePrettyGuidePath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const match = PRETTY_PATH.exec(trimmed.toLowerCase());
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
  const file = SITEMAP_FILE.exec(path.toLowerCase());
  if (file && SUPPORTED_LOCALES.includes(file[1])) {
    return { kind: 'locale', locale: file[1] };
  }
  const fromQuery = String(new URLSearchParams(search).get('locale') ?? '')
    .trim()
    .toLowerCase();
  if (fromQuery && SUPPORTED_LOCALES.includes(fromQuery)) {
    return { kind: 'locale', locale: fromQuery };
  }
  return { kind: 'index', locale: null };
}
