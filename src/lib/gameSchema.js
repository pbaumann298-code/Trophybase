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
  inviteKeys: 'invite_keys',
  communityReports: 'community_reports',
  contentCreators: 'content_creators',
  gameCreatorMap: 'game_creator_map',
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

/** public.game_creator_map */
export const GAME_CREATOR_MAP = {
  gameId: 'game_id',
  creatorId: 'creator_id',
  contentType: 'content_type',
};

export const CREATOR_CONTENT_TYPE = {
  video: 'VIDEO',
};

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
  /** IGDB-Publisher, getrennt vom Hauptstudio */
  publisher: 'publisher',
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
  slug: 'slug',
  /** false = darf nicht in den Suchindex (z. B. Quickwins, nur über die Suche auffindbar) */
  isIndexable: 'is_indexable',
  /** Guide-Seitenaufrufe; Startseite „Beliebt“ sortiert danach */
  views: 'views',
  /** Stimmungstags (Allowlist), z. B. soulslike, open_world */
  homeTags: 'home_tags',
  /** true = Modell darf home_tags nicht überschreiben */
  homeTagsLocked: 'home_tags_locked',
};

/** Allowlist-Slugs für games.home_tags (muss mit home_tag_defs übereinstimmen). */
export const HOME_TAGS = {
  SOULSLIKE: 'soulslike',
  OPEN_WORLD: 'open_world',
  FAMILY: 'family',
  INDIE: 'indie',
  RACING: 'racing',
};

/** Tag-Slug → Startseiten-Reihe. Studios/Franchises haben keine Tags. */
export const HOME_TAG_RAILS = {
  [HOME_TAGS.SOULSLIKE]: 'souls',
  [HOME_TAGS.OPEN_WORLD]: 'openworld',
  [HOME_TAGS.FAMILY]: 'family',
  [HOME_TAGS.INDIE]: 'indie',
  [HOME_TAGS.RACING]: 'racing',
};

/** Werte von games.spiel_typ */
export const GAME_TYPE = {
  QUICKWIN: 'Quickwin',
  EVERGREEN: 'Evergreen',
  PREMIUM: 'Premium',
  STANDARD: 'Standard',
  /** Online mit Slug, aber nicht in der Sitemap. Einbindung kommt später. */
  SERVER_DEAD: 'Servertot',
};

/** Startseiten-Reihen, die nur redaktionelle Guides zeigen (keine Quickwins). */
export const HOME_FEATURED_GAME_TYPES = [GAME_TYPE.EVERGREEN, GAME_TYPE.PREMIUM];

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
  isOnline: 'is_online',
  isStoryRelated: 'is_story_related',
  videoUrl: 'video_url',
  timestamp: 'timestamp',
  isAutoTranslated: 'is_auto_translated',
  originalLocale: 'original_locale',
  /** Eine Bild-URL vom Trophäen-Crawler. Keine Sprachmap. */
  iconUrl: 'icon_url',
};

/** JSONB-Sprachmaps auf public.game_achievements */
export const ACHIEVEMENT_I18N = {
  name: 'trophy_name',
  desc: 'trophy_desc',
  rarity: 'global_seltenheit',
  guideTip: 'guide_tip',
  /** Sony trophyGroupName (Hauptspiel + DLC), JSONB-Sprachmap */
  groupName: 'spielname',
  /**
   * Ausführliche Fassung des Tipps. Spaltenname mit Bindestrichen und
   * Grossbuchstaben – in SQL/PostgREST zwingend in Anführungszeichen setzen.
   */
  guideTipLong: 'Guide-Tip-lang',
  aiTranslation: 'ai_translation',
};

/** Skalare Spalten auf public.game_guides */
export const GUIDE_STRUCT = {
  id: 'id',
  /** Reihenfolge von Walkthrough, Sammelobjekten und Bossen. Nicht die UUID. */
  guideId: 'guide_id',
  platformGameId: 'platform_game_id',
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
  /** Übergeordnetes Gebiet (z. B. Galaxie) – bündelt mehrere *_group-Kacheln */
  localisation: 'localisation',
  /**
   * JSONB-Array wie sheet_type: in welchen Excel-Reitern localisation gilt
   * (1 Walkthrough, 2 Sammelobjekte, 3 Bosse). Trophäen sind Reiter 0 und
   * stehen in game_achievements, nicht hier.
   */
  localisationSheet: 'localisation_sheet',
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

/**
 * Feldnamen auf dem gemergten Spiel-Objekt (UI). Lokalisierte Felder sind hier
 * bereits aufgelöste Strings – cover_url trägt denselben Namen wie die
 * JSONB-Spalte und wird von mergeGameRecord überschrieben.
 */
export const GAME_FIELDS = {
  title: 'title',
  cover: 'cover_url',
  console: 'hardware',
  genre: 'genre',
  year: 'release_jahr',
  developer: 'entwickler',
  publisher: 'publisher',
  status: 'status',
  serverStatus: 'server_status',
  hasOnlineTrophies: 'has_online_trophies',
  description: 'description',
  statusExplanation: 'status_explanation',
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
