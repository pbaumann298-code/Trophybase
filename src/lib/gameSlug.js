import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';

/** Erlaubte Konsolen-Segmente in /:locale/:hardware/:slug */
export const URL_HARDWARE_SEGMENTS = ['ps5', 'ps4', 'ps3', 'psvita', 'psp'];

const HARDWARE_RANK = {
  ps5: 5,
  ps4: 4,
  ps3: 3,
  psvita: 2,
  psp: 1,
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HARDWARE_SPLIT = /[/+,|&]|und|\band\b/i;

/**
 * Spieltitel → URL-Segment. Deterministisch, ohne Bindestrich-Kollaps am Ende.
 * Muss mit public.tb_slugify() in supabase/games_slug.sql zusammenpassen.
 * @param {unknown} title
 * @returns {string}
 */
export function slugify(title) {
  return String(title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' und ')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeHardwareToken(part) {
  const n = String(part ?? '')
    .toLowerCase()
    .replace(/playstation/g, 'ps')
    .replace(/[^a-z0-9]/g, '');

  if (!n) return null;
  if (n.includes('vita')) return 'psvita';
  if (n.includes('psp')) return 'psp';
  if (n.includes('ps5')) return 'ps5';
  if (n.includes('ps4')) return 'ps4';
  if (n.includes('ps3')) return 'ps3';
  return null;
}

/**
 * games.hardware → URL-Segment (ps5, ps4, …).
 * Mehrfachplattformen wie „PS4/PS5“ nehmen die höchste Generation.
 * Unbekannt / leer → null (kein Pretty-URL).
 * @param {unknown} hardware
 * @returns {string|null}
 */
export function hardwareToUrlSegment(hardware) {
  const raw = String(hardware ?? '').trim();
  if (!raw) return null;

  const tokens = raw.split(HARDWARE_SPLIT).map((part) => part.trim()).filter(Boolean);
  const parts = tokens.length > 0 ? tokens : [raw];

  /** @type {string[]} */
  const segments = [];
  for (const part of parts) {
    const segment = normalizeHardwareToken(part);
    if (segment && !segments.includes(segment)) segments.push(segment);
  }

  if (segments.length === 0) {
    const fallback = normalizeHardwareToken(raw);
    return fallback && URL_HARDWARE_SEGMENTS.includes(fallback) ? fallback : null;
  }

  segments.sort((a, b) => (HARDWARE_RANK[b] ?? 0) - (HARDWARE_RANK[a] ?? 0));
  return segments[0] ?? null;
}

export function isHardwareSegment(value) {
  return URL_HARDWARE_SEGMENTS.includes(String(value ?? '').toLowerCase());
}

export function isSlugSegment(value) {
  return SLUG_PATTERN.test(String(value ?? ''));
}

/**
 * @param {string} [pathname]
 * @returns {{ locale: string, hardware: string, slug: string }|null}
 */
export function parsePrettyGamePath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const parts = trimmed.replace(/^\//, '').split('/').filter(Boolean);
  if (parts.length !== 3) return null;

  const [locale, hardware, slug] = parts.map((part) => part.toLowerCase());
  if (!SUPPORTED_LOCALES.includes(locale)) return null;
  if (!isHardwareSegment(hardware)) return null;
  if (!isSlugSegment(slug)) return null;

  return { locale, hardware, slug };
}

/**
 * @param {string} locale
 * @param {string} hardware
 * @param {string} slug
 */
export function buildPrettyGamePath(locale, hardware, slug) {
  const loc = String(locale ?? '').toLowerCase();
  const hw = String(hardware ?? '').toLowerCase();
  const s = String(slug ?? '').toLowerCase();
  if (!SUPPORTED_LOCALES.includes(loc) || !isHardwareSegment(hw) || !isSlugSegment(s)) {
    return '';
  }
  return `/${loc}/${hw}/${s}`;
}
