export function getProp(obj, keys) {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
}

import { clampProgressPercent } from '../lib/gameSchema';

/** Fortschritt aus user_watchlist.progress_percent */
export function getWatchlistProgress(row) {
  if (!row || row.progress_percent == null) return 0;
  return clampProgressPercent(row.progress_percent);
}