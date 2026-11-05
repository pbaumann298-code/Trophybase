import { GAME_STRUCT, GAME_FIELDS, isQuickwinStyleType } from './gameSchema.js';

const STUDIO_HINT =
  /\b(games?|studios?|entertainment|interactive|software|digital|productions?|inc\.?|ltd\.?|llc|gmbh|corp|corporation|limited|company|co\.|fromsoftware|ubisoft|capcom|nintendo|sony|bandai|namco|square|enix|sega|konami|activision|bethesda|rockstar|naughty|santa monica|electronic arts|\bea\b)\b/i;

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function splitCreditNames(raw) {
  return String(raw ?? '')
    .split(/[,;/|]|(?:\s+&\s+)|(?:\s+and\s+)|(?:\s+und\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeBrand(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Einzelpersonen in IGDB-Credits, keine Studio-Marke.
 * @param {string} name
 */
export function looksLikePersonName(name) {
  const value = String(name ?? '').trim();
  if (!value || STUDIO_HINT.test(value) || /\d/.test(value)) return false;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every((part) => /^[\p{L}][\p{L}'’-]*$/u.test(part));
}

/**
 * @param {string[]} names
 */
export function pickPrimaryStudioName(names) {
  const unique = [];
  const seen = new Set();
  for (const name of names || []) {
    const key = normalizeBrand(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  const companies = unique.filter((name) => !looksLikePersonName(name));
  return companies[0] || unique[0] || '';
}

/**
 * Öffentliche Credits: eine Studio-Marke, Publisher nur wenn er anders heißt
 * und sich zu zeigen lohnt. Quickwins nutzen den Publisher als Studio-Zeile.
 * @param {Record<string, unknown>|null|undefined} game
 * @returns {{ studio: string, publisher: string }}
 */
export function publicStudioCredits(game) {
  const developers = splitCreditNames(game?.[GAME_STRUCT.developer] ?? game?.[GAME_FIELDS.developer]);
  const publishers = splitCreditNames(game?.[GAME_STRUCT.publisher]);
  const gameType = String(game?.[GAME_STRUCT.gameType] ?? '').trim();

  let studio = pickPrimaryStudioName(developers);
  const publisher = pickPrimaryStudioName(publishers);
  const same = Boolean(studio && publisher && normalizeBrand(studio) === normalizeBrand(publisher));

  if (looksLikePersonName(studio) && publisher) {
    studio = publisher;
  }
  if (!studio && publisher) {
    studio = publisher;
  }
  if (looksLikePersonName(studio) && !publisher) {
    studio = '';
  }

  if (isQuickwinStyleType(gameType) && publisher && !same) {
    return { studio: publisher, publisher: '' };
  }

  return {
    studio,
    publisher: publisher && !same && publisher !== studio ? publisher : '',
  };
}

/** Bekannte Dachmarken. Längere Namen zuerst, damit „Bandai Namco“ vor kürzeren Präfixen greift. */
const SEARCHABLE_STUDIO_ROOTS = [
  'Electronic Arts',
  'Bandai Namco',
  'Artifex Mundi',
  'EastAsiaSoft',
  'FromSoftware',
  'Square Enix',
  'Warner Bros',
  'Koei Tecmo',
  'Naughty Dog',
  'Codemasters',
  'PlayStation',
  'Activision',
  'Annapurna',
  'Bethesda',
  'Blizzard',
  'Devolver',
  'Insomniac',
  'Lightwood',
  'Ratalaika',
  'Rockstar',
  'Team17',
  'ThiGames',
  'Ubisoft',
  'Capcom',
  'Focus',
  'Konami',
  'Powgi',
  'Sony',
  'Sega',
  'THQ',
  '2K',
];

const STUDIO_ROOT_PATTERNS = [...SEARCHABLE_STUDIO_ROOTS]
  .sort((a, b) => b.length - a.length)
  .map((root) => ({
    root,
    pattern: new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

const STUDIO_SUFFIX_PATTERN = /\s+(?:studios?|games?|entertainment|interactive|software|digital|productions?|publishing|gmbh|inc\.?|ltd\.?|llc|corp\.?|co\.?|plc|s\.?a\.?|s\.?r\.?o\.?|montreal|toronto|tokyo|london|austin|bucharest|shanghai|kyiv|paris|milan|sofia|osaka|vancouver|san diego|japan|america|europe|uk|us|de)\b.*$/i;

/**
 * Suchbarer Markenkern: bekannte Dachmarke, sonst ohne Rechtsform- und Standort-Suffix.
 * „Ubisoft Montreal“ → „Ubisoft“, „Rockstar North“ → „Rockstar“.
 * @param {unknown} rawName
 * @returns {string}
 */
export function extractSearchableStudioRoot(rawName) {
  const name = String(rawName ?? '').trim();
  if (!name) return '';
  for (const { root, pattern } of STUDIO_ROOT_PATTERNS) {
    if (pattern.test(name)) return root;
  }
  const stripped = name.replace(STUDIO_SUFFIX_PATTERN, '').trim();
  if (stripped.length >= 3) return stripped;
  return name;
}
