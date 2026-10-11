import { getGameTitle } from './gameModel';
import { GAME_STRUCT } from './gameSchema';
import { pickPrimaryStudioName, publicStudioCredits, splitCreditNames } from './studioCredits';

/**
 * Gruppenname der Übersicht.
 * games.publisher, sobald gesetzt. Bei den aktuellen Quickwins ist die Spalte
 * leer, dann gilt dieselbe Studio-Marke wie auf der Kachel (games.entwickler).
 */
export function quickwinPublisherKey(game) {
  const fromPublisher = pickPrimaryStudioName(splitCreditNames(game?.[GAME_STRUCT.publisher]));
  if (fromPublisher) return fromPublisher;
  return publicStudioCredits(game).studio || '';
}

/** Userseite: Publisher unter dieser Anzahl bleiben unsichtbar. */
export const QUICKWIN_PUBLISHER_MIN = 10;

const BRAND_SUFFIXES = [
  'entertainment',
  'interactive',
  'publishing',
  'studios',
  'studio',
  'games',
  'game',
  'digital',
  'gmbh',
  'sro',
  'llc',
  'ltd',
  'inc',
  'sl',
];

/** Vergleichsschlüssel: Großschreibung, Satzzeichen und Rechtsform-Anhänge fallen weg. */
export function quickwinBrandCore(name) {
  let key = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  let stripped = true;
  while (stripped && key.length > 4) {
    stripped = false;
    for (const suffix of BRAND_SUFFIXES) {
      if (!key.endsWith(suffix)) continue;
      const remain = key.length - suffix.length;
      if (remain < 4) continue;
      key = key.slice(0, remain);
      stripped = true;
      break;
    }
  }
  return key;
}

function sameBrandCore(a, b) {
  if (!a || !b || a === b) return a === b && Boolean(a);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 5) return false;
  return long.startsWith(short) || long.endsWith(short);
}

/**
 * Gleiche Marke, verschiedene Schreibweise: Smobile/SMobile, Webnetic/Webnetic s. r. o.
 * Schlüssel ist der Kern, Anzeigename die häufigste Originalschreibweise.
 * @returns {Map<string, { key: string, label: string }>}
 */
export function buildQuickwinPublisherCanon(games) {
  const counts = new Map();
  for (const game of games ?? []) {
    const name = quickwinPublisherKey(game);
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const names = [...counts.keys()];
  const parent = new Map(names.map((name) => [name, name]));
  const find = (name) => {
    let root = name;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = name;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const cores = new Map(names.map((name) => [name, quickwinBrandCore(name)]));
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (sameBrandCore(cores.get(names[i]), cores.get(names[j]))) union(names[i], names[j]);
    }
  }

  const clusters = new Map();
  for (const name of names) {
    const root = find(name);
    const list = clusters.get(root);
    if (list) list.push(name);
    else clusters.set(root, [name]);
  }

  const canon = new Map();
  for (const [, members] of clusters) {
    const shortest = members.reduce((best, name) => {
      const core = cores.get(name) || '';
      if (!best || core.length < best.length) return core;
      return best;
    }, '');
    const baseNames = members.filter((name) => (cores.get(name) || '') === shortest);
    const pool = baseNames.length > 0 ? baseNames : members;
    const label = [...pool].sort((a, b) => {
      const byCount = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (byCount !== 0) return byCount;
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b, 'de');
    })[0];
    const key = shortest || cores.get(members[0]) || members[0];
    for (const name of members) canon.set(name, { key, label });
  }
  return canon;
}

export function quickwinPublisherIdentity(game, canon) {
  const exact = quickwinPublisherKey(game);
  if (!canon || !exact) return { key: exact, label: exact };
  return canon.get(exact) || { key: exact, label: exact };
}

function titleHaystack(game) {
  const raw = game?.spieltitel;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.values(raw)
      .map((value) => String(value ?? ''))
      .join('\n')
      .toLowerCase();
  }
  return String(getGameTitle(game) ?? '').toLowerCase();
}

export function filterQuickwins(games, { title = '', publisher = '' } = {}, canon = null) {
  const words = String(title ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const publisherKey = String(publisher ?? '').trim();

  return (games ?? []).filter((game) => {
    if (publisherKey) {
      const identity = quickwinPublisherIdentity(game, canon);
      const matches = canon ? identity.label === publisherKey : identity.key === publisherKey;
      if (!matches) return false;
    }
    if (words.length === 0) return true;
    const haystack = titleHaystack(game);
    return words.every((word) => haystack.includes(word));
  });
}

function yearValue(game) {
  const year = Number(game?.[GAME_STRUCT.releaseYear]);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function compareTitle(a, b, locale) {
  return getGameTitle(a, locale).localeCompare(getGameTitle(b, locale), locale || 'de', {
    sensitivity: 'base',
    numeric: true,
  });
}

/** Sortierung innerhalb eines Publishers. Jahre ohne Wert bleiben am Ende. */
export function sortQuickwins(games, sort, locale) {
  const list = [...(games ?? [])];
  if (sort === 'year-asc' || sort === 'year-desc') {
    const direction = sort === 'year-desc' ? -1 : 1;
    list.sort((a, b) => {
      const yearA = yearValue(a);
      const yearB = yearValue(b);
      if (yearA == null && yearB == null) return compareTitle(a, b, locale);
      if (yearA == null) return 1;
      if (yearB == null) return -1;
      if (yearA !== yearB) return direction * (yearA - yearB);
      return compareTitle(a, b, locale);
    });
    return list;
  }

  const direction = sort === 'title-desc' ? -1 : 1;
  list.sort((a, b) => direction * compareTitle(a, b, locale));
  return list;
}

export function groupQuickwinsByPublisher(games, locale, emptyLabel, canon = null) {
  const buckets = new Map();
  for (const game of games ?? []) {
    const identity = quickwinPublisherIdentity(game, canon);
    const bucketKey = identity.key || '';
    const list = buckets.get(bucketKey);
    if (list) list.games.push(game);
    else buckets.set(bucketKey, { label: identity.label, games: [game] });
  }

  const groups = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: bucket.label || emptyLabel,
    games: bucket.games,
  }));

  groups.sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.label.localeCompare(b.label, locale || 'de', { sensitivity: 'base' });
  });
  return groups;
}

export function quickwinPublisherOptions(games, canon = null) {
  const names = new Set();
  for (const game of games ?? []) {
    const identity = quickwinPublisherIdentity(game, canon);
    if (identity.label) names.add(identity.label);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}
