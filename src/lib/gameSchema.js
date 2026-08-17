/**
 * Supabase-Schema (Stand i18n-Umbau).
 *
 * Lokalisierte Inhalte liegen als JSONB-Sprachmaps ({ de, en, es }) direkt auf
 * games / game_achievements / game_guides – es gibt keine *_translations-Tabellen
 * mehr.
 */

export const TABLES = {
  games: 'games',
  achievements: 'game_achievements',
  guides: 'game_guides',
  profiles: 'profiles',
  earnedTrophies: 'user_earned_trophies',
  watchlist: 'user_watchlist',
  inbox: 'user_inbox',
  qaDashboard: 'qa_dashboard',
  statusMessages: 'trophy_status_messages',
  inviteKeys: 'invite_keys',
  onlineTrophiesLog: 'online_trophies_log',
  communityReports: 'community_reports',
};

export const QA_STATUS = {
  open: 'open',
  confirmed: 'confirmed',
  deferred: 'deferred',
};

/** games.id (UUID) */
export const GAME_PK = 'id';

/** Plattform-ID (z. B. NPWR…) auf games.platform_game_id */
export const GAME_PLATFORM_ID = 'platform_game_id';

/** FK in Kind- und User-Tabellen → games.id */
export const GAME_FK = 'game_id';

export const ACHIEVEMENT_PK = 'platform_achievement_id';

/** game_guides.id (UUID) */
export const GUIDE_PK = 'id';

export const FALLBACK_LANGUAGE = 'en';

/** Skalare Spalten auf public.games */
export const GAME_STRUCT = {
  ecosystem: 'ecosystem',
  hardware: 'hardware',
  igdbId: 'igdb_id',
  releaseYear: 'release_jahr',
  upcomingDate: 'upcoming_date',
  developer: 'entwickler',
  genre: 'genre',
  gameType: 'spiel_typ',
  progress: 'fortschritt',
  status: 'status',
  serverStatus: 'server_status',
  hasOnlineTrophies: 'has_online_trophies',
  hasMissableTrophies: 'has_missable_trophies',
  totalOnlineTrophies: 'total_online_trophies',
  totalMissableTrophies: 'total_missable_trophies',
  platinumAchievable: 'platinum_achievable',
  trophyCount: 'anzahl_trophaeen',
  isSonyFallback: 'is_sony_fallback',
  isAutoTranslated: 'is_auto_translated',
  originalLocale: 'original_locale',
  createdAt: 'created_at',
};

/** JSONB-Sprachmaps auf public.games */
export const GAME_I18N = {
  title: 'spieltitel',
  coverUrl: 'cover_url',
  description: 'beschreibung',
  statusExplanation: 'status_explanation_localized',
};

/** Skalare Spalten auf public.game_achievements */
export const ACHIEVEMENT_STRUCT = {
  platformGameId: 'platform_game_id',
  trophyType: 'trophy_type',
  isHidden: 'ist_versteckt',
  trophyGroup: 'trophy_gruppe',
  isMissable: 'is_missable',
  isStoryRelated: 'is_story_related',
  isUnachievable: 'is_unachievable',
  videoUrl: 'video_url',
  timestamp: 'timestamp',
  isAutoTranslated: 'is_auto_translated',
  originalLocale: 'original_locale',
};

/** JSONB-Sprachmaps auf public.game_achievements */
export const ACHIEVEMENT_I18N = {
  name: 'trophy_name',
  desc: 'trophy_desc',
  iconUrl: 'icon_url',
  rarity: 'global_seltenheit',
  guideTip: 'guide_tip',
  aiTranslation: 'ai_translation',
};

/** Skalare Spalten auf public.game_guides */
export const GUIDE_STRUCT = {
  id: 'id',
  platformGameId: 'platform_game_id',
  localId: 'local_id',
  timestamp: 'timestamp',
  videoUrl: 'video_url',
  trophyId: 'trophy_id',
  isTrophyRelevant: 'is_trophy_relevant',
  createdAt: 'created_at',
};

/** JSONB-Spalten auf public.game_guides */
export const GUIDE_I18N = {
  sheetType: 'sheet_type',
  itemName: 'item_name',
  chronologicalGroup: 'chronological_group',
  categoryGroup: 'category_group',
  videoChapter: 'video_chapter',
};

/**
 * Reiter-Diskriminator aus game_guides.sheet_type.
 * Entspricht dem pandas-Sheet-Index des Upload-Skripts (Excel-Reiter 1 =
 * Trophäen → game_achievements, daher beginnt game_guides bei 1).
 */
export const GUIDE_SHEET_TYPE = {
  WALKTHROUGH: 1,
  COLLECTIBLES: 2,
  BOSSES: 3,
};

/**
 * Robustheits-Fallback, falls sheet_type statt Zahlen lokalisierte
 * Reiternamen enthält ({ de: 'Sammelobjekte', … }).
 */
const SHEET_TYPE_PATTERNS = [
  { type: GUIDE_SHEET_TYPE.BOSSES, pattern: /boss|jefe/i },
  { type: GUIDE_SHEET_TYPE.COLLECTIBLES, pattern: /sammel|collect|coleccion|colecci|objeto/i },
  { type: GUIDE_SHEET_TYPE.WALKTHROUGH, pattern: /walkthrough|komplettl|chronolog|kapitel|chapter|guia|guía|capitulo|capítulo/i },
];

function sheetTypeFromText(text) {
  const value = String(text ?? '').trim();
  if (!value) return 0;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  for (const { type, pattern } of SHEET_TYPE_PATTERNS) {
    if (pattern.test(value)) return type;
  }
  return 0;
}

function collectSheetTypes(value, out) {
  if (value == null) return;

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0) out.add(value);
    return;
  }

  if (typeof value === 'string') {
    const type = sheetTypeFromText(value);
    if (type) out.add(type);
    return;
  }

  if (Array.isArray(value) || typeof value === 'object') {
    for (const entry of Object.values(value)) collectSheetTypes(entry, out);
  }
}

/**
 * sheet_type ist ein JSONB-Array: Ein Eintrag kann in mehreren Excel-Reitern
 * stehen und wird beim Upload zu einer Zeile zusammengefasst – z. B. [1, 2]
 * für ein Sammelobjekt, das auch im Walkthrough auftaucht.
 * @param {unknown} value game_guides.sheet_type (JSONB)
 * @returns {number[]} aufsteigend sortiert und dedupliziert, z. B. [1], [1,2], [3]
 */
export function resolveSheetTypes(value) {
  /** @type {Set<number>} */
  const out = new Set();
  collectSheetTypes(value, out);
  return [...out].sort((a, b) => a - b);
}

/**
 * Reiter-Zugehörigkeit eines gemergten Guide-Eintrags. Maßgeblich ist
 * sheet_types; der skalare sheet_type dient nur als Rückfall.
 * @param {{ sheet_types?: number[], sheet_type?: number }} row
 * @param {number} type
 */
export function hasSheetType(row, type) {
  if (!row) return false;
  const wanted = Number(type);
  if (Array.isArray(row.sheet_types) && row.sheet_types.length > 0) {
    return row.sheet_types.includes(wanted);
  }
  return Number(row.sheet_type) === wanted;
}

export const WATCHLIST = {
  progress: 'progress_percent',
  status: 'status',
  onConflict: 'user_id,game_id',
};

/** Feldnamen auf dem gemergten Spiel-Objekt (UI) */
export const GAME_FIELDS = {
  title: 'title',
  cover: 'cover_url',
  console: 'hardware',
  genre: 'genre',
  year: 'release_jahr',
  developer: 'entwickler',
  status: 'status',
  serverStatus: 'server_status',
  hasOnlineTrophies: 'has_online_trophies',
  description: 'description',
  platformGameId: 'platform_game_id',
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
