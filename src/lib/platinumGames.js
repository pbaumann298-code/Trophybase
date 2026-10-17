import { isUuid } from './gameModel';
import { loadLocalPlatinumFlag } from './localUserProgress';

const PLATINUM_PREFIX = 'tb_platinum:';

/** Lokale Platin-Flags aus localStorage. */
export function scanLocalPlatinumGameIds() {
  const ids = [];
  if (typeof window === 'undefined' || !window.localStorage) return ids;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PLATINUM_PREFIX)) continue;
      if (window.localStorage.getItem(key) !== '1') continue;
      const id = key.slice(PLATINUM_PREFIX.length).trim();
      if (isUuid(id)) ids.push(id);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

export function isLocalPlatinumGame(gameId) {
  return loadLocalPlatinumFlag(gameId);
}
