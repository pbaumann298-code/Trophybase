import { useSyncExternalStore } from 'react';
import { HOME_CATEGORIES } from './homeCategories';
import { SUPPORTED_LOCALES } from './locale';

const STORAGE_KEY = 'tb_user_preferences';

export const USER_PREFERENCES_STORAGE_KEY = STORAGE_KEY;

export const VIDEO_TIMESTAMP_LAYOUT_KEY = 'tb_video_timestamp_layout';
export const HIDE_PLATINUMED_GAMES_KEY = 'tb_hide_platinumed_games';
export const COMPLETED_TROPHY_STYLE_KEY = 'tb_completed_trophy_style';
export const HIDE_SWIPE_HANDLES_KEY = 'tb_hide_swipe_handles';
export const GUIDE_ROW_ORDER_KEY = 'tb_guide_row_order';
export const PREFERRED_LOCALES_KEY = 'preferred_locales';
export const TILE_DESCRIPTION_SLIDE_KEY = 'tb_tile_desc_slide';

export const VIDEO_TIMESTAMP_LAYOUT = {
  VIDEO_LEFT: 'video-left',
  TIMESTAMPS_LEFT: 'timestamps-left',
};

export const COMPLETED_TROPHY_STYLE = {
  CHECK: 'check',
  DIM: 'dim',
  HIDE: 'hide',
};

export const GUIDE_ROW_ORDER = {
  DEFAULT: 'default',
  CHECKBOX_RIGHT: 'checkbox-right',
  TIMESTAMP_RIGHT: 'timestamp-right',
};

export const TILE_DESCRIPTION_SLIDE = {
  RIGHT: 'right',
  LEFT: 'left',
};

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

export function sanitizePreferredLocales(rawList) {
  const allowed = new Set(SUPPORTED_LOCALES);
  const next = [];
  for (const item of Array.isArray(rawList) ? rawList : []) {
    const code = String(item ?? '').trim().toLowerCase();
    if (allowed.has(code) && !next.includes(code)) {
      next.push(code);
    }
  }
  return next.length > 0 ? next : ['de', 'en'];
}

export function sanitizeUserPreferences(raw) {
  const mode = HOME_LAYOUT_MODES.includes(raw?.homeLayoutMode)
    ? raw.homeLayoutMode
    : HOME_LAYOUT_MODE.RAILS;
  const hasList = Array.isArray(raw?.orderedHomeCategories);
  const videoLayout =
    raw?.videoTimestampLayout === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
      ? VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
      : VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT;
  const completedStyle =
    raw?.completedTrophyStyle === COMPLETED_TROPHY_STYLE.CHECK ||
    raw?.completedTrophyStyle === COMPLETED_TROPHY_STYLE.HIDE
      ? raw.completedTrophyStyle
      : COMPLETED_TROPHY_STYLE.DIM;
  const guideRowOrder =
    raw?.guideRowOrder === GUIDE_ROW_ORDER.CHECKBOX_RIGHT ||
    raw?.guideRowOrder === GUIDE_ROW_ORDER.TIMESTAMP_RIGHT
      ? raw.guideRowOrder
      : GUIDE_ROW_ORDER.DEFAULT;
  const preferredLocales = sanitizePreferredLocales(raw?.preferredLocales);
  const tileDescriptionSlide =
    raw?.tileDescriptionSlide === TILE_DESCRIPTION_SLIDE.LEFT
      ? TILE_DESCRIPTION_SLIDE.LEFT
      : TILE_DESCRIPTION_SLIDE.RIGHT;

  return {
    homeLayoutMode: mode,
    orderedHomeCategories: hasList
      ? uniqueKnownIds(raw.orderedHomeCategories)
      : [...DEFAULT_ORDERED_HOME_CATEGORIES],
    videoTimestampLayout: videoLayout,
    hidePlatinumedGames: Boolean(raw?.hidePlatinumedGames),
    completedTrophyStyle: completedStyle,
    hideSwipeHandles: Boolean(raw?.hideSwipeHandles),
    guideRowOrder,
    preferredLocales,
    tileDescriptionSlide,
  };
}

export function getDefaultUserPreferences() {
  return {
    homeLayoutMode: HOME_LAYOUT_MODE.RAILS,
    orderedHomeCategories: [...DEFAULT_ORDERED_HOME_CATEGORIES],
    videoTimestampLayout: VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT,
    hidePlatinumedGames: false,
    completedTrophyStyle: COMPLETED_TROPHY_STYLE.DIM,
    hideSwipeHandles: false,
    guideRowOrder: GUIDE_ROW_ORDER.DEFAULT,
    preferredLocales: ['de', 'en'],
    tileDescriptionSlide: TILE_DESCRIPTION_SLIDE.RIGHT,
  };
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const videoTimestampLayout =
      localStorage.getItem(VIDEO_TIMESTAMP_LAYOUT_KEY) === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
        ? VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
        : VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT;
    const hidePlatinumRaw = localStorage.getItem(HIDE_PLATINUMED_GAMES_KEY);
    const hidePlatinumedGames = hidePlatinumRaw === '1' || hidePlatinumRaw === 'true';
    const completedRaw = localStorage.getItem(COMPLETED_TROPHY_STYLE_KEY);
    const completedTrophyStyle =
      completedRaw === COMPLETED_TROPHY_STYLE.CHECK ||
      completedRaw === COMPLETED_TROPHY_STYLE.HIDE
        ? completedRaw
        : COMPLETED_TROPHY_STYLE.DIM;
    const hideSwipeRaw = localStorage.getItem(HIDE_SWIPE_HANDLES_KEY);
    const hideSwipeHandles = hideSwipeRaw === '1' || hideSwipeRaw === 'true';
    const guideRowOrderRaw = localStorage.getItem(GUIDE_ROW_ORDER_KEY);
    const guideRowOrder =
      guideRowOrderRaw === GUIDE_ROW_ORDER.CHECKBOX_RIGHT ||
      guideRowOrderRaw === GUIDE_ROW_ORDER.TIMESTAMP_RIGHT
        ? guideRowOrderRaw
        : parsed?.guideRowOrder;
    const tileSlideRaw = localStorage.getItem(TILE_DESCRIPTION_SLIDE_KEY);
    const tileDescriptionSlide =
      tileSlideRaw === TILE_DESCRIPTION_SLIDE.LEFT
        ? TILE_DESCRIPTION_SLIDE.LEFT
        : parsed?.tileDescriptionSlide;
    let preferredLocales = parsed?.preferredLocales;
    const rawPreferred = localStorage.getItem(PREFERRED_LOCALES_KEY);
    if (rawPreferred) {
      try {
        preferredLocales = JSON.parse(rawPreferred);
      } catch {
        preferredLocales = rawPreferred.split(',').map((s) => s.trim());
      }
    }

    return sanitizeUserPreferences({
      ...parsed,
      videoTimestampLayout,
      hidePlatinumedGames,
      completedTrophyStyle,
      hideSwipeHandles,
      guideRowOrder,
      preferredLocales,
      tileDescriptionSlide,
    });
  } catch {
    return getDefaultUserPreferences();
  }
}

function persistPreferences(prefs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        homeLayoutMode: prefs.homeLayoutMode,
        orderedHomeCategories: prefs.orderedHomeCategories,
        preferredLocales: prefs.preferredLocales,
      }),
    );
    localStorage.setItem(VIDEO_TIMESTAMP_LAYOUT_KEY, prefs.videoTimestampLayout);
    localStorage.setItem(HIDE_PLATINUMED_GAMES_KEY, prefs.hidePlatinumedGames ? '1' : '0');
    localStorage.setItem(COMPLETED_TROPHY_STYLE_KEY, prefs.completedTrophyStyle);
    localStorage.setItem(HIDE_SWIPE_HANDLES_KEY, prefs.hideSwipeHandles ? '1' : '0');
    localStorage.setItem(GUIDE_ROW_ORDER_KEY, prefs.guideRowOrder);
    localStorage.setItem(TILE_DESCRIPTION_SLIDE_KEY, prefs.tileDescriptionSlide);
    localStorage.setItem(PREFERRED_LOCALES_KEY, JSON.stringify(prefs.preferredLocales));
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
    if (
      event.key !== STORAGE_KEY &&
      event.key !== VIDEO_TIMESTAMP_LAYOUT_KEY &&
      event.key !== HIDE_PLATINUMED_GAMES_KEY &&
      event.key !== COMPLETED_TROPHY_STYLE_KEY &&
      event.key !== HIDE_SWIPE_HANDLES_KEY &&
      event.key !== GUIDE_ROW_ORDER_KEY &&
      event.key !== TILE_DESCRIPTION_SLIDE_KEY &&
      event.key !== PREFERRED_LOCALES_KEY
    ) {
      return;
    }
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

export function setVideoTimestampLayout(layout) {
  const next =
    layout === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
      ? VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
      : VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT;
  commit({ ...snapshot, videoTimestampLayout: next });
}

export function setHidePlatinumedGames(hide) {
  commit({ ...snapshot, hidePlatinumedGames: Boolean(hide) });
}

export function setCompletedTrophyStyle(style) {
  const next =
    style === COMPLETED_TROPHY_STYLE.CHECK || style === COMPLETED_TROPHY_STYLE.HIDE
      ? style
      : COMPLETED_TROPHY_STYLE.DIM;
  commit({ ...snapshot, completedTrophyStyle: next });
}

export function setHideSwipeHandles(hide) {
  commit({ ...snapshot, hideSwipeHandles: Boolean(hide) });
}

export function setTileDescriptionSlide(slide) {
  const next =
    slide === TILE_DESCRIPTION_SLIDE.LEFT
      ? TILE_DESCRIPTION_SLIDE.LEFT
      : TILE_DESCRIPTION_SLIDE.RIGHT;
  commit({ ...snapshot, tileDescriptionSlide: next });
}

export function setGuideRowOrder(order) {
  const next =
    order === GUIDE_ROW_ORDER.CHECKBOX_RIGHT ||
    order === GUIDE_ROW_ORDER.TIMESTAMP_RIGHT
      ? order
      : GUIDE_ROW_ORDER.DEFAULT;
  commit({ ...snapshot, guideRowOrder: next });
}

export function setPreferredLocales(locales) {
  commit({ ...snapshot, preferredLocales: sanitizePreferredLocales(locales) });
}

export function togglePreferredLocale(localeCode) {
  const code = String(localeCode ?? '').trim().toLowerCase();
  if (!SUPPORTED_LOCALES.includes(code)) return snapshot.preferredLocales;
  const current = snapshot.preferredLocales || ['de'];
  let next;
  if (current.includes(code)) {
    next = current.length > 1 ? current.filter((item) => item !== code) : current;
  } else {
    next = [...current, code];
  }
  commit({ ...snapshot, preferredLocales: next });
  return next;
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
  commit({ ...snapshot, ...blueprint.apply(snapshot) });
}

export function resetToDefaultBlueprint() {
  commit(getDefaultUserPreferences());
}

export function useUserPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getDefaultUserPreferences);
  return {
    homeLayoutMode: prefs.homeLayoutMode,
    orderedHomeCategories: prefs.orderedHomeCategories,
    videoTimestampLayout: prefs.videoTimestampLayout,
    hidePlatinumedGames: prefs.hidePlatinumedGames,
    completedTrophyStyle: prefs.completedTrophyStyle,
    hideSwipeHandles: prefs.hideSwipeHandles,
    guideRowOrder: prefs.guideRowOrder,
    preferredLocales: prefs.preferredLocales,
    tileDescriptionSlide: prefs.tileDescriptionSlide,
    setHomeLayoutMode,
    setOrderedHomeCategories,
    setVideoTimestampLayout,
    setHidePlatinumedGames,
    setCompletedTrophyStyle,
    setHideSwipeHandles,
    setGuideRowOrder,
    setTileDescriptionSlide,
    setPreferredLocales,
    togglePreferredLocale,
    toggleHomeCategory,
    moveHomeCategory,
    applyHomeBlueprint,
    resetToDefaultBlueprint,
  };
}
