import { HOME_TAG_TRANSLATIONS, translateHomeTag } from './homeTagDefs';
import { QUICKWIN_ALPHABET, titleAlphabetKey } from './quickwinCatalog';
import { GAME_TYPE, parseGameTypes } from './gameSchema';

export const COCKPIT_VIEW_PREFS_KEY = 'tb_cockpit_view_prefs';

export const LIBRARY_BUCKETS = ['PLAYING', 'BACKLOG', 'COMPLETED', 'ALL', 'CHECKLISTS', 'SETTINGS'];
export const GAME_BUCKETS = new Set(['PLAYING', 'BACKLOG', 'COMPLETED', 'ALL']);

export const VIEW_MODES = [
  { id: 'tiles', label: 'Poster', title: 'Poster-Kacheln' },
  { id: 'cards', label: 'Karten', title: 'Detail-Karten' },
  { id: 'table', label: 'Tabelle', title: 'Kompakt-Tabelle' },
];

export const GROUP_MODES = [
  { id: 'none', label: 'Flach (Ohne Gruppierung)' },
  { id: 'category', label: 'Nach Kategorie' },
  { id: 'alpha', label: 'Alphabetisch A–Z' },
  { id: 'year', label: 'Nach Release-Jahr' },
];

export const SORT_MODES = [
  { id: 'recent', label: 'Zuletzt gespielt' },
  { id: 'progress-desc', label: 'Fortschritt %' },
  { id: 'playtime-desc', label: 'Gespielte Stunden' },
  { id: 'title-asc', label: 'Spieltitel A–Z' },
  { id: 'year-desc', label: 'Erscheinungsjahr' },
];

const VIEW_IDS = VIEW_MODES.map((mode) => mode.id);
const GROUP_IDS = GROUP_MODES.map((mode) => mode.id);
const SORT_IDS = SORT_MODES.map((mode) => mode.id);
const TAG_ORDER = new Map(Object.keys(HOME_TAG_TRANSLATIONS).map((slug, index) => [slug, index]));

function pickPref(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function readCockpitViewPrefs() {
  try {
    const raw = localStorage.getItem(COCKPIT_VIEW_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function initialCockpitViewPrefs() {
  const stored = readCockpitViewPrefs();
  return {
    viewMode: pickPref(stored.viewMode, VIEW_IDS, 'tiles'),
    groupBy: pickPref(stored.groupBy, GROUP_IDS, 'none'),
    sortBy: pickPref(stored.sortBy, SORT_IDS, 'recent'),
    activeBucket: LIBRARY_BUCKETS.includes(stored.activeBucket) ? stored.activeBucket : null,
  };
}

export function writeCockpitViewPrefs(prefs) {
  try {
    localStorage.setItem(COCKPIT_VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* privater Modus */
  }
}

function titleCmp(a, b, locale) {
  return String(a.title ?? '').localeCompare(String(b.title ?? ''), locale || 'de', {
    sensitivity: 'base',
  });
}

export function sortLibraryItems(items, sortBy, locale) {
  const list = [...(items ?? [])];
  list.sort((a, b) => {
    switch (sortBy) {
      case 'progress-desc':
        return (Number(b.progressPercent) || 0) - (Number(a.progressPercent) || 0) || titleCmp(a, b, locale);
      case 'playtime-desc':
        return (Number(b.playtimeHours) || 0) - (Number(a.playtimeHours) || 0) || titleCmp(a, b, locale);
      case 'title-asc':
        return titleCmp(a, b, locale);
      case 'year-desc':
        return (Number(b.releaseYear) || 0) - (Number(a.releaseYear) || 0) || titleCmp(a, b, locale);
      case 'recent':
      default: {
        const ta = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0;
        const tb = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0;
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0) || titleCmp(a, b, locale);
      }
    }
  });
  return list;
}

function isQuickwinItem(item) {
  const raw = String(item?.spielTyp ?? '').trim();
  if (raw === 'Quickwin') return true;
  return parseGameTypes(raw).includes(GAME_TYPE.QUICKWIN);
}

export function groupLibraryItems(items, groupBy, locale) {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', items }];
  }

  if (groupBy === 'alpha') {
    const buckets = new Map();
    for (const item of items) {
      const key = titleAlphabetKey(item.title, locale);
      const list = buckets.get(key);
      if (list) list.push(item);
      else buckets.set(key, [item]);
    }
    return [...QUICKWIN_ALPHABET, '#']
      .filter((key) => buckets.has(key))
      .map((key) => ({ key, label: key, items: buckets.get(key) }));
  }

  if (groupBy === 'year') {
    const buckets = new Map();
    for (const item of items) {
      const key = item.releaseYear ? String(item.releaseYear) : 'Ohne Jahr';
      const list = buckets.get(key);
      if (list) list.push(item);
      else buckets.set(key, [item]);
    }
    return [...buckets.keys()]
      .sort((a, b) => {
        if (a === 'Ohne Jahr') return 1;
        if (b === 'Ohne Jahr') return -1;
        return Number(b) - Number(a);
      })
      .map((key) => ({ key, label: key, items: buckets.get(key) }));
  }

  const buckets = new Map();
  const tagSlugs = [];
  const push = (key, label, item) => {
    let group = buckets.get(key);
    if (!group) {
      group = { key, label, items: [] };
      buckets.set(key, group);
    }
    group.items.push(item);
  };

  for (const item of items) {
    if (isQuickwinItem(item)) {
      push('quickwins', '⚡ Quickwins', item);
      continue;
    }
    const tags = [...new Set(
      (Array.isArray(item.homeTags) ? item.homeTags : [])
        .map((tag) => String(tag ?? '').trim())
        .filter(Boolean),
    )];
    if (tags.length === 0) {
      push('other', '🎮 Weitere Spiele', item);
      continue;
    }
    for (const slug of tags) {
      if (!buckets.has(slug)) tagSlugs.push(slug);
      push(slug, translateHomeTag(slug, locale) || slug, item);
    }
  }

  const sections = [];
  if (buckets.has('quickwins')) sections.push(buckets.get('quickwins'));
  const tagSections = tagSlugs
    .map((slug) => buckets.get(slug))
    .filter(Boolean)
    .sort((a, b) => {
      const ia = TAG_ORDER.has(a.key) ? TAG_ORDER.get(a.key) : 999;
      const ib = TAG_ORDER.has(b.key) ? TAG_ORDER.get(b.key) : 999;
      if (ia !== ib) return ia - ib;
      return a.label.localeCompare(b.label, locale || 'de', { sensitivity: 'base' });
    });
  sections.push(...tagSections);
  if (buckets.has('other')) sections.push(buckets.get('other'));
  return sections;
}

export function letterSectionId(key) {
  return `cockpit-letter-${key === '#' ? 'hash' : key}`;
}

export function tileOpenKey(groupKey, gameId) {
  return `${groupKey}::${gameId}`;
}
