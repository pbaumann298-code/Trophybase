import { HIDDEN_IDS_STORAGE_KEY, runGuideKeyMigration } from './guideKeyMigration';

const HIDDEN_IDS_KEY = HIDDEN_IDS_STORAGE_KEY;
const DISPLAY_MODE_KEY = 'tb_hidden_display_mode';

export const DISPLAY_MODE_STORAGE_KEY = DISPLAY_MODE_KEY;

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
  try {
    localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify([...set]));
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
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
  try {
    localStorage.setItem(DISPLAY_MODE_KEY, mode);
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
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
    setHidden(id, hidden) {
      const key = String(id ?? '').trim();
      if (!key) return;
      const currently = hiddenIds.has(key);
      if (Boolean(hidden) === currently) return;
      if (hidden) hiddenIds.add(key);
      else hiddenIds.delete(key);
      writeHiddenIds(hiddenIds);
      notify();
    },
    toggleHidden(id) {
      if (hiddenIds.has(id)) hiddenIds.delete(id);
      else hiddenIds.add(id);
      writeHiddenIds(hiddenIds);
      notify();
    },
    /** UUID-Liste aller als Spiel ausgeblendeten Einträge (`game:{uuid}`). */
    listHiddenGameUuids() {
      const ids = [];
      for (const key of hiddenIds) {
        if (!String(key).startsWith('game:')) continue;
        const id = String(key).slice(5).trim();
        if (id) ids.push(id);
      }
      return ids;
    },
    /**
     * Cloud-/Merge-Ergebnis für Spiele anwenden (nur `game:`-Keys; item:-Keys bleiben).
     * @param {Iterable<string>} gameUuids
     */
    replaceHiddenGameUuids(gameUuids) {
      const next = new Set();
      for (const key of hiddenIds) {
        if (!String(key).startsWith('game:')) next.add(key);
      }
      for (const raw of gameUuids ?? []) {
        const id = String(raw ?? '').trim();
        if (!id) continue;
        next.add(gameVisibilityKey(id));
      }
      hiddenIds = next;
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
    reloadFromStorage() {
      hiddenIds = readHiddenIds();
      displayMode = loadDisplayMode();
      notify();
    },
  };
}
