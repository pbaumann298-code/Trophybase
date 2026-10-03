import {
  COMPLETED_ITEMS_STORAGE_KEY,
  noteLegacyGuideProgressDrained,
  runGuideKeyMigration,
} from './guideKeyMigration';

/**
 * Schlüssel für Fortschritt und Sichtbarkeit eines Guide-Eintrags.
 *
 * Bewusst die nackte guide_id (UUID) und nicht die reiter-präfixierte item.id:
 * Ein Eintrag mit sheet_types [1, 2] wird in zwei Reitern gerendert, ist aber
 * dieselbe DB-Zeile und darf nur einmal abgehakt werden. Die präfixierte
 * item.id bleibt React-Key und Video-Identität.
 * @param {{ guide_id?: string, id?: string }|null|undefined} item
 * @returns {string}
 */
export function guideProgressKey(item) {
  if (!item) return '';
  const guideId = String(item.guide_id ?? '').trim();
  if (guideId) return guideId;
  return String(item.id ?? '').trim();
}

/** Ein Shard pro Spiel, analog zu den Trophäen-Häkchen. */
export const GUIDE_PROGRESS_PREFIX = 'tb_guide_progress:';

export function guideProgressStorageKey(gameId) {
  const id = String(gameId ?? '').trim();
  return id ? `${GUIDE_PROGRESS_PREFIX}${id}` : '';
}

/**
 * @param {...unknown[]} lists Guide-Zeilen (Walkthrough, Sammelobjekte, Bosse)
 * @returns {string[]}
 */
export function collectGuideProgressIds(...lists) {
  const ids = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = guideProgressKey(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function readJson(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

/** @returns {Record<string, { completed: true, updated_at: string|null }>} */
function readShard(gameId) {
  const key = guideProgressStorageKey(gameId);
  if (!key) return {};
  const parsed = readJson(key);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const shard = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!id || !value) continue;
    if (value === true) {
      shard[id] = { completed: true, updated_at: null };
      continue;
    }
    if (typeof value === 'object' && value.completed) {
      shard[id] = {
        completed: true,
        updated_at: typeof value.updated_at === 'string' ? value.updated_at : null,
      };
    }
  }
  return shard;
}

function writeShard(gameId, shard) {
  const key = guideProgressStorageKey(gameId);
  if (!key) return;
  try {
    if (!shard || Object.keys(shard).length === 0) {
      localStorage.removeItem(key);
      return;
    }
    writeJson(key, shard);
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

function boolMapFromShard(shard) {
  const map = {};
  for (const [id, row] of Object.entries(shard ?? {})) {
    if (row?.completed) map[id] = true;
  }
  return map;
}

function readLegacyMap() {
  runGuideKeyMigration();
  const parsed = readJson(COMPLETED_ITEMS_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const map = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!id || !value) continue;
    map[id] = true;
  }
  return map;
}

function writeLegacyMap(map) {
  try {
    if (!map || Object.keys(map).length === 0) {
      noteLegacyGuideProgressDrained();
      return;
    }
    writeJson(COMPLETED_ITEMS_STORAGE_KEY, map);
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

/** Shard des Spiels, ohne Legacy-Blob anzufassen. */
export function readCompletedGuideItems(gameId) {
  return boolMapFromShard(readShard(gameId));
}

/**
 * Übernimmt Häkchen aus dem alten Global-Blob, sobald die guide_ids des Spiels
 * bekannt sind, und liefert die Boolean-Map für die Checkliste.
 * @param {string} gameId
 * @param {string[]} [guideIds]
 */
export function claimCompletedGuideItems(gameId, guideIds = []) {
  const shard = readShard(gameId);
  const ids = Array.isArray(guideIds) ? guideIds : [];
  if (!gameId || ids.length === 0) return boolMapFromShard(shard);

  const legacy = readLegacyMap();
  let legacyDirty = false;
  let shardDirty = false;
  const now = new Date().toISOString();

  for (const rawId of ids) {
    const id = String(rawId ?? '').trim();
    if (!id || !legacy[id]) continue;
    if (!shard[id]) {
      shard[id] = { completed: true, updated_at: now };
      shardDirty = true;
    }
    delete legacy[id];
    legacyDirty = true;
  }

  if (shardDirty) writeShard(gameId, shard);
  if (legacyDirty) writeLegacyMap(legacy);
  return boolMapFromShard(shard);
}

/**
 * @param {string} gameId
 * @param {Record<string, boolean>} items
 */
export function saveCompletedGuideItems(gameId, items) {
  const key = guideProgressStorageKey(gameId);
  if (!key) return;

  const previous = readShard(gameId);
  const now = new Date().toISOString();
  const next = {};

  for (const [id, completed] of Object.entries(items ?? {})) {
    if (!completed) continue;
    const prev = previous[id];
    next[id] = {
      completed: true,
      updated_at: prev?.completed ? prev.updated_at || now : now,
    };
  }

  writeShard(gameId, next);
}

const HIDE_COMPLETED_STORAGE_KEY = 'tb_hide_completed';

export function loadHideCompleted() {
  try {
    return localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHideCompleted(hidden) {
  try {
    localStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}
