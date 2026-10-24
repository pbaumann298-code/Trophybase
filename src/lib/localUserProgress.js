import { isUuid } from './gameModel';
import {
  GUIDE_PROGRESS_PREFIX,
  guideProgressStorageKey,
  readCompletedGuideItems,
  saveCompletedGuideItems,
} from './guideProgressStorage';
import {
  loadUnlockedTrophies,
  saveUnlockedTrophies,
} from './trophyProgressStorage';

export const PROGRESS_OWNER_KEY = 'tb_progress_owner';
export const PROGRESS_SYNCED_EVENT = 'tb_progress_synced';
export const PLATINUM_CHANGED_EVENT = 'tb_platinum_changed';
const PLATINUM_PREFIX = 'tb_platinum:';
const TROPHY_STEP_PREFIX = 't:';
const GUIDE_STEP_PREFIX = 'g:';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadProgressOwner() {
  if (!canUseStorage()) return null;
  try {
    const owner = String(window.localStorage.getItem(PROGRESS_OWNER_KEY) ?? '').trim();
    return owner || null;
  } catch {
    return null;
  }
}

export function saveProgressOwner(userId) {
  if (!canUseStorage()) return;
  try {
    const id = String(userId ?? '').trim();
    if (!id) window.localStorage.removeItem(PROGRESS_OWNER_KEY);
    else window.localStorage.setItem(PROGRESS_OWNER_KEY, id);
  } catch {
    /* ignore */
  }
}

function platinumStorageKey(gameId) {
  const id = String(gameId ?? '').trim();
  return id ? `${PLATINUM_PREFIX}${id}` : '';
}

export function loadLocalPlatinumFlag(gameId) {
  const key = platinumStorageKey(gameId);
  if (!key || !canUseStorage()) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function saveLocalPlatinumFlag(gameId, isPlatinum) {
  const key = platinumStorageKey(gameId);
  if (!key || !canUseStorage()) return;
  try {
    if (isPlatinum) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
    window.dispatchEvent(
      new CustomEvent(PLATINUM_CHANGED_EVENT, {
        detail: { gameId: String(gameId ?? '').trim(), isPlatinum: Boolean(isPlatinum) },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Schritte für die Cloud: Präfixe trennen Trophäen und Guide-IDs. */
export function encodeProgressSteps(trophyIds, guideIds) {
  const steps = [];
  const seen = new Set();
  for (const raw of trophyIds ?? []) {
    const id = String(raw ?? '').trim();
    if (!id) continue;
    const step = `${TROPHY_STEP_PREFIX}${id}`;
    if (seen.has(step)) continue;
    seen.add(step);
    steps.push(step);
  }
  for (const raw of guideIds ?? []) {
    const id = String(raw ?? '').trim();
    if (!id) continue;
    const step = `${GUIDE_STEP_PREFIX}${id}`;
    if (seen.has(step)) continue;
    seen.add(step);
    steps.push(step);
  }
  return steps;
}

export function decodeProgressSteps(steps) {
  const trophies = [];
  const guides = [];
  const trophySeen = new Set();
  const guideSeen = new Set();

  for (const raw of steps ?? []) {
    const value = String(raw ?? '').trim();
    if (!value) continue;

    if (value.startsWith(TROPHY_STEP_PREFIX)) {
      const id = value.slice(TROPHY_STEP_PREFIX.length).trim();
      if (!id || trophySeen.has(id)) continue;
      trophySeen.add(id);
      trophies.push(id);
      continue;
    }
    if (value.startsWith(GUIDE_STEP_PREFIX)) {
      const id = value.slice(GUIDE_STEP_PREFIX.length).trim();
      if (!id || guideSeen.has(id)) continue;
      guideSeen.add(id);
      guides.push(id);
      continue;
    }
    // Alt / ohne Präfix: UUID → Guide, sonst Trophäe
    if (isUuid(value)) {
      if (guideSeen.has(value)) continue;
      guideSeen.add(value);
      guides.push(value);
    } else {
      if (trophySeen.has(value)) continue;
      trophySeen.add(value);
      trophies.push(value);
    }
  }

  return { trophies, guides };
}

function sortedUnique(values) {
  return [...new Set((values ?? []).map((v) => String(v ?? '').trim()).filter(Boolean))].sort();
}

function stepsFingerprint(steps, isPlatinum) {
  return `${isPlatinum ? '1' : '0'}|${sortedUnique(steps).join('\n')}`;
}

export function progressMapsEqual(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const gameId of keys) {
    const left = a?.[gameId];
    const right = b?.[gameId];
    const leftSteps = left?.steps ?? [];
    const rightSteps = right?.steps ?? [];
    if (stepsFingerprint(leftSteps, left?.isPlatinum) !== stepsFingerprint(rightSteps, right?.isPlatinum)) {
      return false;
    }
  }
  return true;
}

export function isLocalSubsetOfCloud(localByGame, cloudByGame) {
  for (const [gameId, localRow] of Object.entries(localByGame ?? {})) {
    const cloudRow = cloudByGame?.[gameId];
    const cloudStepsSet = new Set(cloudRow?.steps ?? []);
    for (const step of localRow?.steps ?? []) {
      if (!cloudStepsSet.has(step)) return false;
    }
    if (localRow?.isPlatinum && !cloudRow?.isPlatinum) return false;
  }
  return true;
}

function countSteps(byGame) {
  let games = 0;
  let steps = 0;
  for (const row of Object.values(byGame ?? {})) {
    const n = (row?.steps ?? []).length;
    if (n > 0 || row?.isPlatinum) {
      games += 1;
      steps += n;
    }
  }
  return { games, steps };
}

/**
 * Alle lokalen Fortschritts-Shards einlesen (Trophäen + Guide + Platin-Flag).
 * @returns {Record<string, { steps: string[], isPlatinum: boolean }>}
 */
export function scanLocalProgressByGame() {
  if (!canUseStorage()) return {};

  const byGame = {};
  const ensure = (gameId) => {
    if (!byGame[gameId]) byGame[gameId] = { trophyIds: [], guideIds: [], isPlatinum: false };
    return byGame[gameId];
  };

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;

      if (key.startsWith('tb_unlocked_trophies:')) {
        const gameId = key.slice('tb_unlocked_trophies:'.length).trim();
        if (!isUuid(gameId)) continue;
        const map = loadUnlockedTrophies(gameId);
        const row = ensure(gameId);
        row.trophyIds = Object.keys(map);
        continue;
      }

      if (key.startsWith(GUIDE_PROGRESS_PREFIX)) {
        const gameId = key.slice(GUIDE_PROGRESS_PREFIX.length).trim();
        if (!isUuid(gameId)) continue;
        const map = readCompletedGuideItems(gameId);
        const row = ensure(gameId);
        row.guideIds = Object.keys(map);
        continue;
      }

      if (key.startsWith(PLATINUM_PREFIX)) {
        const gameId = key.slice(PLATINUM_PREFIX.length).trim();
        if (!isUuid(gameId) || window.localStorage.getItem(key) !== '1') continue;
        ensure(gameId).isPlatinum = true;
      }
    }
  } catch {
    return {};
  }

  const encoded = {};
  for (const [gameId, row] of Object.entries(byGame)) {
    const steps = encodeProgressSteps(row.trophyIds, row.guideIds);
    if (steps.length === 0 && !row.isPlatinum) continue;
    encoded[gameId] = { steps, isPlatinum: Boolean(row.isPlatinum) };
  }
  return encoded;
}

/** Aktuellen lokalen Stand eines Spiels als Cloud-Payload. */
export function localProgressPayloadForGame(gameId) {
  const id = String(gameId ?? '').trim();
  if (!isUuid(id)) return { steps: [], isPlatinum: false };
  const trophies = Object.keys(loadUnlockedTrophies(id));
  const guides = Object.keys(readCompletedGuideItems(id));
  return {
    steps: encodeProgressSteps(trophies, guides),
    isPlatinum: loadLocalPlatinumFlag(id),
  };
}

/**
 * Cloud-Stand (oder gemergten Stand) in localStorage schreiben.
 * @param {Record<string, { steps: string[], isPlatinum?: boolean }>} byGame
 * @param {{ replaceAll?: boolean }} [options] replaceAll löscht lokale Spiele die nicht in byGame sind
 */
export function applyProgressByGameToLocal(byGame, { replaceAll = false } = {}) {
  if (!canUseStorage()) return;

  const targetIds = new Set(Object.keys(byGame ?? {}).filter((id) => isUuid(id)));

  if (replaceAll) {
    const toRemove = [];
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        let gameId = '';
        if (key.startsWith('tb_unlocked_trophies:')) gameId = key.slice('tb_unlocked_trophies:'.length);
        else if (key.startsWith(GUIDE_PROGRESS_PREFIX)) gameId = key.slice(GUIDE_PROGRESS_PREFIX.length);
        else if (key.startsWith(PLATINUM_PREFIX)) gameId = key.slice(PLATINUM_PREFIX.length);
        else continue;
        gameId = gameId.trim();
        if (isUuid(gameId) && !targetIds.has(gameId)) toRemove.push(key);
      }
      for (const key of toRemove) window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  for (const [gameId, row] of Object.entries(byGame ?? {})) {
    if (!isUuid(gameId)) continue;
    const { trophies, guides } = decodeProgressSteps(row?.steps ?? []);
    const trophyMap = {};
    for (const id of trophies) trophyMap[id] = true;
    const guideMap = {};
    for (const id of guides) guideMap[id] = true;
    saveUnlockedTrophies(gameId, trophyMap);
    saveCompletedGuideItems(gameId, guideMap);
    saveLocalPlatinumFlag(gameId, Boolean(row?.isPlatinum));
  }

  try {
    window.dispatchEvent(new CustomEvent(PROGRESS_SYNCED_EVENT, { detail: { gameIds: [...targetIds] } }));
  } catch {
    /* ignore */
  }
}

/** Union zweier Fortschrittskarten. */
export function mergeProgressByGame(localByGame, cloudByGame) {
  const merged = {};
  const ids = new Set([
    ...Object.keys(localByGame ?? {}),
    ...Object.keys(cloudByGame ?? {}),
  ]);
  for (const gameId of ids) {
    if (!isUuid(gameId)) continue;
    const local = localByGame?.[gameId];
    const cloud = cloudByGame?.[gameId];
    const localDecoded = decodeProgressSteps(local?.steps ?? []);
    const cloudDecoded = decodeProgressSteps(cloud?.steps ?? []);
    const steps = encodeProgressSteps(
      [...localDecoded.trophies, ...cloudDecoded.trophies],
      [...localDecoded.guides, ...cloudDecoded.guides],
    );
    const isPlatinum = Boolean(local?.isPlatinum || cloud?.isPlatinum);
    if (steps.length === 0 && !isPlatinum) continue;
    merged[gameId] = { steps, isPlatinum };
  }
  return merged;
}

/**
 * @param {{ localByGame?: object, cloudByGame?: object, owner?: string|null, userId?: string }} input
 * @returns {{ action: 'noop'|'pull'|'auto_merge'|'prompt', reason?: string, localByGame: object, cloudByGame: object, localStats: {games:number,steps:number}, cloudStats: {games:number,steps:number} }}
 */
export function planProgressSync({ localByGame, cloudByGame, owner, userId }) {
  const local = localByGame ?? {};
  const cloud = cloudByGame ?? {};
  const localStats = countSteps(local);
  const cloudStats = countSteps(cloud);
  const localEmpty = localStats.games === 0 && localStats.steps === 0;
  const equal = progressMapsEqual(local, cloud);

  if (localEmpty) {
    return {
      action: cloudStats.games > 0 ? 'pull' : 'noop',
      reason: 'local_empty',
      localByGame: local,
      cloudByGame: cloud,
      localStats,
      cloudStats,
    };
  }

  if (owner === userId) {
    if (equal) {
      return {
        action: 'noop',
        reason: 'in_sync',
        localByGame: local,
        cloudByGame: cloud,
        localStats,
        cloudStats,
      };
    }
    return {
      action: 'auto_merge',
      reason: 'divergent',
      localByGame: local,
      cloudByGame: cloud,
      localStats,
      cloudStats,
    };
  }

  if (equal || isLocalSubsetOfCloud(local, cloud)) {
    return {
      action: 'noop',
      reason: 'local_subset_of_cloud',
      localByGame: local,
      cloudByGame: cloud,
      localStats,
      cloudStats,
    };
  }

  // Browser hat eigene nicht-synchronisierte Daten, Profil leer / anders / anderer Owner → nachfragen
  return {
    action: 'prompt',
    reason: !owner
      ? 'first_login'
      : owner !== userId
        ? 'foreign_or_cleared'
        : cloudStats.games === 0
          ? 'profile_empty'
          : 'divergent',
    localByGame: local,
    cloudByGame: cloud,
    localStats,
    cloudStats,
  };
}

export { guideProgressStorageKey };
