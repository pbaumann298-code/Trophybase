/**
 * Manuelle Trophäen-Häkchen (ohne Login / ohne PSN-Sync).
 * Ein Schlüssel pro Spiel, damit nicht 42.000 Listen in einem Blob landen.
 */

const STORAGE_PREFIX = 'tb_unlocked_trophies:';

function storageKey(gameId) {
  const id = String(gameId ?? '').trim();
  return id ? `${STORAGE_PREFIX}${id}` : '';
}

function compactUnlockedMap(items, earnedIds) {
  const compact = {};
  for (const [id, value] of Object.entries(items ?? {})) {
    if (!value) continue;
    if (earnedIds?.has?.(id)) continue;
    compact[id] = true;
  }
  return compact;
}

export function loadUnlockedTrophies(gameId) {
  const key = storageKey(gameId);
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return compactUnlockedMap(parsed);
  } catch {
    return {};
  }
}

export function saveUnlockedTrophies(gameId, items, earnedIds) {
  const key = storageKey(gameId);
  if (!key) return;
  try {
    const compact = compactUnlockedMap(items, earnedIds);
    if (Object.keys(compact).length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(compact));
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

/** localStorage + von PSN verdiente IDs (verdiente gewinnen). */
export function mergeUnlockedTrophies(gameId, earnedIds) {
  const stored = loadUnlockedTrophies(gameId);
  if (!earnedIds?.size) return stored;
  const next = { ...stored };
  for (const id of earnedIds) next[id] = true;
  return next;
}
