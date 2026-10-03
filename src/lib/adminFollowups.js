const STORAGE_PREFIX = 'tb_admin_followups:';
const CHANGE_EVENT = 'tb-admin-followups';

export function adminFollowupsStorageKey(userId) {
  return `${STORAGE_PREFIX}${String(userId ?? '').trim()}`;
}

function readEntries(userId) {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(adminFollowupsStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: String(entry?.id ?? '').trim(),
        title: String(entry?.title ?? '').trim(),
        addedAt: String(entry?.addedAt ?? '').trim(),
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

function writeEntries(userId, entries) {
  localStorage.setItem(adminFollowupsStorageKey(userId), JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId } }));
}

export function loadAdminFollowups(userId) {
  return readEntries(userId);
}

export function isAdminFollowup(userId, gameId) {
  const id = String(gameId ?? '').trim();
  if (!userId || !id) return false;
  return readEntries(userId).some((entry) => entry.id === id);
}

/**
 * @param {string} userId
 * @param {{ id: string, title?: string }} game
 */
export function toggleAdminFollowup(userId, game) {
  const id = String(game?.id ?? '').trim();
  if (!userId || !id) return readEntries(userId);

  const current = readEntries(userId);
  const exists = current.some((entry) => entry.id === id);
  const next = exists
    ? current.filter((entry) => entry.id !== id)
    : [
        {
          id,
          title: String(game?.title ?? '').trim(),
          addedAt: new Date().toISOString(),
        },
        ...current,
      ];

  try {
    writeEntries(userId, next);
  } catch {
    throw new Error('Wiedervorlage konnte nicht gespeichert werden.');
  }
  return next;
}

export function subscribeAdminFollowups(userId, listener) {
  if (typeof window === 'undefined') return () => {};

  const notify = () => listener(readEntries(userId));
  const onCustom = (event) => {
    const changedUser = event.detail?.userId;
    if (!changedUser || changedUser === userId) notify();
  };
  const onStorage = (event) => {
    if (event.key === adminFollowupsStorageKey(userId)) notify();
  };

  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
