const ALWAYS_KEY = 'tb_hidden_trophies_always';
const GAME_PREFIX = 'tb_hidden_trophies:';

export const HIDDEN_TROPHY_MODE = {
  SHOW: 'show',
  HIDE: 'hide',
  ALWAYS: 'always',
};

function gameKey(gameId) {
  const id = String(gameId ?? '').trim();
  return id ? `${GAME_PREFIX}${id}` : '';
}

/** Wirksame Wahl für ein Spiel. Ohne Speicher: verstecken. */
export function loadHiddenTrophyMode(gameId) {
  try {
    if (localStorage.getItem(ALWAYS_KEY) === '1') return HIDDEN_TROPHY_MODE.ALWAYS;
    const key = gameKey(gameId);
    if (key && localStorage.getItem(key) === 'show') return HIDDEN_TROPHY_MODE.SHOW;
  } catch {
    /* localStorage nicht verfügbar */
  }
  return HIDDEN_TROPHY_MODE.HIDE;
}

/**
 * „Anzeigen“ gilt nur für dieses Spiel, „Immer anzeigen“ für alle.
 * „Verstecken“ hebt die spielübergreifende Wahl auf.
 */
export function saveHiddenTrophyMode(gameId, mode) {
  try {
    if (mode === HIDDEN_TROPHY_MODE.ALWAYS) {
      localStorage.setItem(ALWAYS_KEY, '1');
      return;
    }
    localStorage.removeItem(ALWAYS_KEY);
    const key = gameKey(gameId);
    if (!key) return;
    if (mode === HIDDEN_TROPHY_MODE.SHOW) localStorage.setItem(key, 'show');
    else localStorage.removeItem(key);
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

export function hiddenTrophiesRevealed(mode) {
  return mode === HIDDEN_TROPHY_MODE.SHOW || mode === HIDDEN_TROPHY_MODE.ALWAYS;
}
