/** Exakte Supabase-Struktur für TrophyBase */

export const TABLES = {
  games: 'Playstation_Games',
  watchlist: 'user_watchlist',
  trophies: 'game_trophies',
  guides: 'game_guides',
  chapters: 'game_chapters',
  bosses: 'game_bosses',
  inbox: 'user_inbox',
  qaDashboard: 'qa_dashboard',
  statusMessages: 'trophy_status_messages',
  inviteKeys: 'invite_keys',
};

/** qa_dashboard.status */
export const QA_STATUS = {
  open: 'open',
  confirmed: 'confirmed',
  deferred: 'deferred',
};

/** Primary Key der Spiele-Master-Tabelle */
export const GAME_PK = 'NPWR_ID';

/** Fremdschlüssel in Watchlist, Guides & Trophäen → NPWR_ID */
export const GAME_FK = 'game_id';

export const WATCHLIST = {
  progress: 'progress_percent',
  status: 'status',
};

export const GAME_FIELDS = {
  title: 'Spieltitel',
  cover: 'Cover_URL',
  console: 'Konsole',
  genre: 'Genre',
  year: 'Release_Jahr',
  developer: 'Entwickler',
  status: 'Status',
  serverStatus: 'server_status',
};

export const ACTIVE_WATCHLIST_STATUSES = ['active', 'aktiv', 'playing'];

export function isActiveWatchlistStatus(status) {
  if (status == null || status === '') return true;
  return ACTIVE_WATCHLIST_STATUSES.includes(String(status).toLowerCase());
}

export function clampProgressPercent(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
