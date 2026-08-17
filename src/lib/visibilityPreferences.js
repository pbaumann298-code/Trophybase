import { HIDDEN_IDS_STORAGE_KEY, runGuideKeyMigration } from './guideKeyMigration';

const HIDDEN_IDS_KEY = HIDDEN_IDS_STORAGE_KEY;
const DISPLAY_MODE_KEY = 'tb_hidden_display_mode';

export const VISIBILITY_MODE = {
  /** Ausgeblendete Einträge bleiben sichtbar, aber ausgegraut */
  DIM: 'dim',
  /** Ausgeblendete Einträge werden komplett aus der Liste entfernt */
  FILTER: 'filter',
};

/** @param {string} id guideProgressKey(item), nicht die reiter-präfixierte item.id */
export function itemVisibilityKey(id) {
  return `item:${id}`;
}

export function gameVisibilityKey(npwrId) {
  return `game:${npwrId}`;
}

function readHiddenIds() {
  runGuideKeyMigration();
  try {
    const raw = localStorage.getItem(HIDDEN_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeHiddenIds(set) {
  localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify([...set]));
}

export function loadDisplayMode() {
  try {
    const mode = localStorage.getItem(DISPLAY_MODE_KEY);
    return mode === VISIBILITY_MODE.FILTER ? VISIBILITY_MODE.FILTER : VISIBILITY_MODE.DIM;
  } catch {
    return VISIBILITY_MODE.DIM;
  }
}

export function saveDisplayMode(mode) {
  localStorage.setItem(DISPLAY_MODE_KEY, mode);
}

export function createVisibilityStore() {
  let hiddenIds = readHiddenIds();
  let displayMode = loadDisplayMode();
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn());

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getDisplayMode() {
      return displayMode;
    },
    setDisplayMode(mode) {
      displayMode = mode;
      saveDisplayMode(mode);
      notify();
    },
    isHidden(id) {
      return hiddenIds.has(id);
    },
    toggleHidden(id) {
      if (hiddenIds.has(id)) hiddenIds.delete(id);
      else hiddenIds.add(id);
      writeHiddenIds(hiddenIds);
      notify();
    },
    /**
     * @param {string} id
     * @param {{ completed?: boolean }} [options]
     */
    getEntryState(id, { completed = false } = {}) {
      const affected = hiddenIds.has(id) || completed;
      if (!affected) return { visible: true, dimmed: false };
      if (displayMode === VISIBILITY_MODE.FILTER) return { visible: false, dimmed: false };
      return { visible: true, dimmed: true };
    },
    getSnapshot() {
      return { displayMode, hiddenCount: hiddenIds.size };
    },
  };
}
