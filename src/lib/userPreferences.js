import { useSyncExternalStore } from 'react';
import { HOME_CATEGORIES } from './homeCategories';

const STORAGE_KEY = 'tb_user_preferences';

export const USER_PREFERENCES_STORAGE_KEY = STORAGE_KEY;

export const HOME_LAYOUT_MODE = {
  RAILS: 'rails',
  GRID: 'grid',
  TABLE: 'table',
  MINIMAL: 'minimal',
};

export const HOME_LAYOUT_MODES = Object.values(HOME_LAYOUT_MODE);

/** Die 12 Original-Schienen der live Startseite (`tb_get_home_rails`). */
export const DEFAULT_ORDERED_HOME_CATEGORIES = [
  'beliebt',
  'neu',
  'souls',
  'capcom',
  'openworld',
  'ubisoft',
  'rockstar',
  'family',
  'indie',
  'racing',
  'godofwar',
  'tombraider',
];

export const ACTION_HOME_CATEGORIES = [
  'souls',
  'action_adventure',
  'rpg',
  'openworld',
  'godofwar',
  'tombraider',
  'capcom',
  'horror',
];

const knownCategoryIds = () => new Set(HOME_CATEGORIES.map((cat) => cat.id));

function uniqueKnownIds(ids) {
  const known = knownCategoryIds();
  const next = [];
  for (const raw of ids ?? []) {
    const id = String(raw ?? '').trim();
    if (!id || !known.has(id) || next.includes(id)) continue;
    next.push(id);
  }
  return next;
}

export function sanitizeUserPreferences(raw) {
  const mode = HOME_LAYOUT_MODES.includes(raw?.homeLayoutMode)
    ? raw.homeLayoutMode
    : HOME_LAYOUT_MODE.RAILS;
  const hasList = Array.isArray(raw?.orderedHomeCategories);
  return {
    homeLayoutMode: mode,
    orderedHomeCategories: hasList
      ? uniqueKnownIds(raw.orderedHomeCategories)
      : [...DEFAULT_ORDERED_HOME_CATEGORIES],
  };
}

export function getDefaultUserPreferences() {
  return {
    homeLayoutMode: HOME_LAYOUT_MODE.RAILS,
    orderedHomeCategories: [...DEFAULT_ORDERED_HOME_CATEGORIES],
  };
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUserPreferences();
    return sanitizeUserPreferences(JSON.parse(raw));
  } catch {
    return getDefaultUserPreferences();
  }
}

function persistPreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

const listeners = new Set();
let snapshot = typeof window === 'undefined' ? getDefaultUserPreferences() : loadPreferences();

function notify() {
  listeners.forEach((fn) => fn());
}

function commit(next) {
  snapshot = sanitizeUserPreferences(next);
  persistPreferences(snapshot);
  notify();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = loadPreferences();
    notify();
  });
}

export function getUserPreferences() {
  return snapshot;
}

export function setHomeLayoutMode(mode) {
  commit({ ...snapshot, homeLayoutMode: mode });
}

export function setOrderedHomeCategories(ids) {
  commit({ ...snapshot, orderedHomeCategories: ids });
}

export function toggleHomeCategory(id) {
  const key = String(id ?? '').trim();
  if (!knownCategoryIds().has(key)) return;
  const current = snapshot.orderedHomeCategories;
  const next = current.includes(key)
    ? current.filter((item) => item !== key)
    : [...current, key];
  commit({ ...snapshot, orderedHomeCategories: next });
}

export function moveHomeCategory(id, direction) {
  const key = String(id ?? '').trim();
  const list = [...snapshot.orderedHomeCategories];
  const index = list.indexOf(key);
  const nextIndex = index + (direction < 0 ? -1 : 1);
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  commit({ ...snapshot, orderedHomeCategories: list });
}

export const HOME_BLUEPRINTS = [
  {
    id: 'original',
    emoji: '🏆',
    titleKey: 'blueprintOriginalTitle',
    bodyKey: 'blueprintOriginalBody',
    apply: () => getDefaultUserPreferences(),
  },
  {
    id: 'action',
    emoji: '⚔️',
    titleKey: 'blueprintActionTitle',
    bodyKey: 'blueprintActionBody',
    apply: () => ({
      homeLayoutMode: HOME_LAYOUT_MODE.RAILS,
      orderedHomeCategories: [...ACTION_HOME_CATEGORIES],
    }),
  },
  {
    id: 'grid',
    emoji: '🎯',
    titleKey: 'blueprintGridTitle',
    bodyKey: 'blueprintGridBody',
    apply: (current) => ({
      homeLayoutMode: HOME_LAYOUT_MODE.GRID,
      orderedHomeCategories: current.orderedHomeCategories.length
        ? current.orderedHomeCategories
        : [...DEFAULT_ORDERED_HOME_CATEGORIES],
    }),
  },
  {
    id: 'table',
    emoji: '📊',
    titleKey: 'blueprintTableTitle',
    bodyKey: 'blueprintTableBody',
    apply: (current) => ({
      homeLayoutMode: HOME_LAYOUT_MODE.TABLE,
      orderedHomeCategories: current.orderedHomeCategories.length
        ? current.orderedHomeCategories
        : [...DEFAULT_ORDERED_HOME_CATEGORIES],
    }),
  },
  {
    id: 'minimal',
    emoji: '🧘',
    titleKey: 'blueprintMinimalTitle',
    bodyKey: 'blueprintMinimalBody',
    apply: (current) => ({
      homeLayoutMode: HOME_LAYOUT_MODE.MINIMAL,
      orderedHomeCategories: current.orderedHomeCategories,
    }),
  },
];

export function applyHomeBlueprint(blueprintId) {
  const blueprint = HOME_BLUEPRINTS.find((item) => item.id === blueprintId);
  if (!blueprint) return;
  commit(blueprint.apply(snapshot));
}

export function resetToDefaultBlueprint() {
  commit(getDefaultUserPreferences());
}

export function useUserPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getDefaultUserPreferences);
  return {
    homeLayoutMode: prefs.homeLayoutMode,
    orderedHomeCategories: prefs.orderedHomeCategories,
    setHomeLayoutMode,
    setOrderedHomeCategories,
    toggleHomeCategory,
    moveHomeCategory,
    applyHomeBlueprint,
    resetToDefaultBlueprint,
  };
}
