import { isUuid } from './gameModel';

const STORAGE_KEY = 'tb_watchlist_ids';
const STORAGE_VERSION = 1;
const NPWR_ID_PATTERN = /^NPWR\d+_\d+$/i;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Neue Einträge nur UUID; NPWR bleibt lesbar, damit Altdaten entfernbar sind. */
function isPersistedWatchlistId(id) {
  return isUuid(id) || NPWR_ID_PATTERN.test(id);
}

function storageWriteError(err) {
  if (err?.name === 'QuotaExceededError' || err?.code === 22) {
    return new Error('Speicher voll. Watchlist konnte nicht gespeichert werden.');
  }
  return err instanceof Error ? err : new Error('Watchlist konnte nicht gespeichert werden.');
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const entry of value) {
    const id = String(entry ?? '').trim();
    if (!id || !isPersistedWatchlistId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function watchlistIdsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function readStoredWatchlist() {
  if (!canUseStorage()) return { ids: [], owner: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ids: [], owner: null };
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : parsed?.ids;
    const owner = typeof parsed?.owner === 'string' && parsed.owner ? parsed.owner : null;
    return { ids: normalizeIds(ids), owner };
  } catch {
    return { ids: [], owner: null };
  }
}

export function loadLocalWatchlistIds() {
  return readStoredWatchlist().ids;
}

/** Letzter Account, mit dem diese Geräte-Liste zusammengeführt wurde. */
export function loadWatchlistOwner() {
  return readStoredWatchlist().owner;
}

export function saveLocalWatchlistIds(ids, owner = undefined) {
  const next = normalizeIds(ids);
  const nextOwner = owner === undefined ? loadWatchlistOwner() : owner || null;
  if (!canUseStorage()) return next;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, ids: next, owner: nextOwner }),
    );
  } catch (err) {
    throw storageWriteError(err);
  }
  return next;
}

/**
 * Login-Merge.
 * Gleicher oder noch kein Owner: Vereinigung, lokale UUIDs die in der Cloud fehlen werden hochgeladen.
 * Anderer Account: nur dessen Cloud-Liste, die vorherige Geräte-Liste wird nicht mitkopiert.
 * @param {{ localIds?: string[], cloudIds?: Iterable<string>, owner?: string|null, userId?: string }} input
 */
export function planWatchlistMerge({ localIds, cloudIds, owner, userId }) {
  const cloud = [];
  const cloudSet = new Set();
  for (const entry of cloudIds ?? []) {
    const id = String(entry ?? '').trim();
    if (!isUuid(id) || cloudSet.has(id)) continue;
    cloudSet.add(id);
    cloud.push(id);
  }

  if (owner && owner !== userId) {
    return { ids: cloud, pushIds: [] };
  }

  const ids = [];
  const seen = new Set();
  const pushIds = [];
  for (const entry of localIds ?? []) {
    const id = String(entry ?? '').trim();
    if (!isPersistedWatchlistId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (isUuid(id) && !cloudSet.has(id)) pushIds.push(id);
  }
  for (const id of cloud) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ids, pushIds };
}

export function toggleLocalWatchlistId(gameId) {
  const id = String(gameId ?? '').trim();
  const current = loadLocalWatchlistIds();
  if (!id) return { ids: current, added: false };

  const onList = current.includes(id);
  if (!onList && !isUuid(id)) {
    throw new Error('Spiel-ID ungültig');
  }

  const ids = onList ? current.filter((entry) => entry !== id) : [id, ...current];
  return { ids: saveLocalWatchlistIds(ids), added: !onList };
}

/**
 * NPWR/UUID-Dubletten auf games.id zusammenführen. Unaufgelöste NPWRs bleiben.
 * @param {string[]} ids
 * @param {(id: string) => string} resolveUuid
 */
export function canonicalizeWatchlistIds(ids, resolveUuid) {
  const seen = new Set();
  const next = [];
  for (const entry of ids ?? []) {
    const id = String(entry ?? '').trim();
    if (!id) continue;
    const uuid = String(resolveUuid?.(id) ?? '').trim();
    const kept = isUuid(uuid) ? uuid : isPersistedWatchlistId(id) ? id : '';
    if (!kept || seen.has(kept)) continue;
    seen.add(kept);
    next.push(kept);
  }
  return next;
}

export { STORAGE_KEY as LOCAL_WATCHLIST_STORAGE_KEY };
