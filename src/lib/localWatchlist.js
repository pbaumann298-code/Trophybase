const STORAGE_KEY = 'tb_watchlist_ids';
const STORAGE_VERSION = 1;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const entry of value) {
    const id = String(entry ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function loadLocalWatchlistIds() {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeIds(parsed);
    if (parsed && parsed.v === STORAGE_VERSION) return normalizeIds(parsed.ids);
    return normalizeIds(parsed?.ids);
  } catch {
    return [];
  }
}

export function saveLocalWatchlistIds(ids) {
  if (!canUseStorage()) return normalizeIds(ids);
  const next = normalizeIds(ids);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ v: STORAGE_VERSION, ids: next }),
  );
  return next;
}

export function toggleLocalWatchlistId(gameId) {
  const id = String(gameId ?? '').trim();
  const current = loadLocalWatchlistIds();
  if (!id) return { ids: current, added: false };

  const onList = current.includes(id);
  const ids = onList ? current.filter((entry) => entry !== id) : [id, ...current];
  return { ids: saveLocalWatchlistIds(ids), added: !onList };
}

export { STORAGE_KEY as LOCAL_WATCHLIST_STORAGE_KEY };
