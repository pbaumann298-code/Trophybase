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

export function filterQuickwins(games, { title = '', publisher = '' } = {}) {
  const words = String(title ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const publisherKey = String(publisher ?? '').trim();

  return (games ?? []).filter((game) => {
    if (publisherKey && quickwinPublisherKey(game) !== publisherKey) return false;
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

export function groupQuickwinsByPublisher(games, locale, emptyLabel) {
  const buckets = new Map();
  for (const game of games ?? []) {
    const key = quickwinPublisherKey(game);
    const list = buckets.get(key);
    if (list) list.push(game);
    else buckets.set(key, [game]);
  }

  const groups = [...buckets.entries()].map(([key, items]) => ({
    key,
    label: key || emptyLabel,
    games: items,
  }));

  groups.sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.label.localeCompare(b.label, locale || 'de', { sensitivity: 'base' });
  });
  return groups;
}

export function quickwinPublisherOptions(games) {
  const names = new Set();
  for (const game of games ?? []) {
    const key = quickwinPublisherKey(game);
    if (key) names.add(key);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}
