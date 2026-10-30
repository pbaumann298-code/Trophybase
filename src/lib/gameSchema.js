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
  /**
   * Staging-/Hilfstabelle: Rohmaterial-Kandidaten aus Scraper Ultra (Tinder-Review).
   * Siehe game_guides_rohmaterial – gleiche Guide-Spalten plus batch_key/batch_status.
   */
  guidesRohmaterial: 'game_guides_rohmaterial',
  /** Schnell-Queue / Entwürfe (flache Spalten, siehe SUPABASE_SCHEMA.mdc). */
  stagingGuides: 'staging_game_guides',
  profiles: 'profiles',
  earnedTrophies: 'user_earned_trophies',
  watchlist: 'user_watchlist',
  gameRatings: 'user_game_ratings',
  /** Guide- + manuelle Trophäen-Häkchen (siehe user_state_schema.sql). */
  guideProgress: 'user_guide_progress',
  /** Ausgeblendete Spiele (siehe user_state_schema.sql). */
  gameSettings: 'user_game_settings',
  inbox: 'user_inbox',
  qaDashboard: 'qa_dashboard',
  inviteKeys: 'invite_keys',
  /** Beta-Zugänge (Tester_XXXXX + Passwort). Siehe beta_testers.sql. */
  betaTesters: 'beta_testers',
  communityReports: 'community_reports',
  contentCreators: 'content_creators',
  /** Distinct (game_id, creator_id) aus game_guides. Siehe game_guides_creator_id.sql. */
  gameGuideCreators: 'game_guide_creators',
  /** Temporäre Admin-Merkliste. Siehe game_wiedervorlage.sql. Kein Fremdschlüssel. */
  gameWiedervorlage: 'game_wiedervorlage',
  /** Krankenstation View für fehlerhafte oder fehlende Cover. */
  sickbayCovers: 'v_sickbay_covers',
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
  /** IGDB-Publisher, getrennt vom Hauptstudio */
  publisher: 'publisher',
  gameType: 'spiel_typ',
  /** Redaktionelle Guide-Kategorie S/A/B/C/D (D = Radar-only, ohne Video-Guide). */
  guideTyp: 'guide_typ',
  progress: 'fortschritt',
  status: 'status',
  /** Nur die freigegebenen Sprachen, z. B. { de: 'PUBLISHED', en: 'PUBLISHED' }. */
  publishingStatus: 'publishing_status',
  /** Kürzel der freigegebenen Sprachen, z. B. ['de', 'en']. */
  publishedLocales: 'published_locales',
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
  /** false = darf nicht in den Suchindex (Quickwin, easy_platin, Servertot) */
  isIndexable: 'is_indexable',
  /** true = Guide ist schreibgeschützt (trg_protect_published_guides) */
  isGuideLocked: 'is_guide_locked',
  /** Guide-Seitenaufrufe; Startseite „Beliebt“ sortiert danach */
  views: 'views',
  /** Stimmungstags (Allowlist), z. B. soulslike, open_world */
  homeTags: 'home_tags',
  /** true = Modell darf home_tags nicht überschreiben */
  homeTagsLocked: 'home_tags_locked',
  /** Platin-Anforderungsprofil (6-Achsen-DNA) */
  radarProfile: 'radar_profile',
  /** Cover-Prüfstatus ('valid' | 'invalid' | null) */
  coverStatus: 'cover_status',
  /** Fehlerhinweis aus der Cover-Prüfung (z. B. Qwen-VL) */
  coverNotes: 'cover_notes',
};

/** Allowlist-Slugs für games.home_tags (muss mit home_tag_defs übereinstimmen). */
export const HOME_TAGS = {
  SOULSLIKE: 'soulslike',
  OPEN_WORLD: 'open_world',
  FAMILY: 'family',
  INDIE: 'indie',
  RACING: 'racing',
  FPS: 'fps',
  TPS: 'tps',
  LOOT_SHOOTER: 'loot_shooter',
  TACTICS: 'tactics',
  COOP_MP: 'coop_mp',
  RPG: 'rpg',
  SURVIVAL_HORROR: 'survival_horror',
};

/** Tag-Slug → Startseiten-Reihe. Studios/Franchises haben keine Tags. */
export const HOME_TAG_RAILS = {
  [HOME_TAGS.SOULSLIKE]: 'souls',
  [HOME_TAGS.OPEN_WORLD]: 'openworld',
  [HOME_TAGS.FAMILY]: 'family',
  [HOME_TAGS.INDIE]: 'indie',
  [HOME_TAGS.RACING]: 'racing',
  [HOME_TAGS.FPS]: 'fps',
  [HOME_TAGS.TPS]: 'tps',
  [HOME_TAGS.LOOT_SHOOTER]: 'lootshooter',
  [HOME_TAGS.TACTICS]: 'tactics',
  [HOME_TAGS.COOP_MP]: 'coop',
  [HOME_TAGS.RPG]: 'rpg',
  [HOME_TAGS.SURVIVAL_HORROR]: 'horror',
};

/** Werte von games.spiel_typ */
export const GAME_TYPE = {
  QUICKWIN: 'Quickwin',
  /** Wie Quickwin: online möglich, noindex, noch ohne eigene Übersicht. */
  EASY_PLATIN: 'easy_platin',
  EVERGREEN: 'Evergreen',
  PREMIUM: 'Premium',
  STANDARD: 'Standard',
  /** Nur auf der Sammelseite „Unobtainable platins“, nicht in Suche/Startseite/Sitemap. */
  SERVER_DEAD: 'Servertot',
  /** Guide-Text ist nicht brauchbar. Bleibt noindex. */
  UNREADABLE: 'Unlesbar',
};

/**
 * Wandelt games.spiel_typ (String, Komma-getrennt, JSON-Array oder Array) in ein sauberes String-Array um.
 * @param {unknown} spielTypInput
 * @returns {string[]} Max. 2 Werte als Array
 */
export function parseGameTypes(spielTypInput) {
  if (!spielTypInput) return [];
  if (Array.isArray(spielTypInput)) {
    return spielTypInput.map((t) => String(t ?? '').trim()).filter(Boolean);
  }
  const raw = String(spielTypInput ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t ?? '').trim()).filter(Boolean);
      }
    } catch {
      /* fallback to split below */
    }
  }
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Formatiert bis zu 2 Spieltypen als Komma-getrennten String ("Typ1, Typ2").
 * @param {unknown} typesInput
 * @returns {string}
 */
export function formatGameTypes(typesInput) {
  const list = parseGameTypes(typesInput);
  const unique = [...new Set(list)].slice(0, 2);
  return unique.join(', ');
}

/** Typen, die regulär den Index-Status aktivieren */
export const INDEXABLE_GAME_TYPES = new Set([
  GAME_TYPE.STANDARD,
  GAME_TYPE.PREMIUM,
  GAME_TYPE.EVERGREEN,
]);

/** Harte NoIndex-Blocker (Veto-Typen) */
export const BLOCKING_NOINDEX_GAME_TYPES = new Set([
  GAME_TYPE.UNREADABLE,
  GAME_TYPE.SERVER_DEAD,
]);

/**
 * Berechnet is_indexable für eine Liste von Spieltypen:
 * - Falls ein NoIndex-Blocker ("Unlesbar", "Servertot") enthalten ist -> false
 * - Sobald mindestens ein regulär indexierbarer Typ ("Standard", "Evergreen", "Premium") enthalten ist -> true
 * - Sonst -> false
 * @param {unknown} gameTypeInput
 * @returns {boolean}
 */
export function computeIsIndexable(gameTypeInput) {
  const types = parseGameTypes(gameTypeInput);
  if (types.some((t) => BLOCKING_NOINDEX_GAME_TYPES.has(t))) {
    return false;
  }
  return types.some((t) => INDEXABLE_GAME_TYPES.has(t));
}

/** Quickwin und easy_platin: in der normalen Suche ausblendbar.
 * Gibt nur dann true zurück, wenn Quickwin oder easy_platin enthalten ist
 * UND KEINER der höherwertigen Typen (Evergreen, Premium, Standard) im Array enthalten ist.
 */
export function isQuickwinStyleType(gameType) {
  const types = parseGameTypes(gameType);
  const hasQuickwinStyle = types.includes(GAME_TYPE.QUICKWIN) || types.includes(GAME_TYPE.EASY_PLATIN);
  const hasFeatured = types.some((t) => INDEXABLE_GAME_TYPES.has(t));
  return hasQuickwinStyle && !hasFeatured;
}

/** Servertot: nur Unobtainable-Platins-Seite, nirgends sonst verlinkt. */
export function isServerDeadType(gameType) {
  const types = parseGameTypes(gameType);
  return types.includes(GAME_TYPE.SERVER_DEAD);
}

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
  isCollectible: 'is_collectible',
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
  prodNote: 'prod_note',
  trophyId: 'trophy_id',
  isTrophyRelevant: 'is_trophy_relevant',
  /** FK → content_creators.id. Ein Creator pro Guide-Zeile, nicht mehr über game_creator_map. */
  creatorId: 'creator_id',
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
  bossGroup: 'boss_group',
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
  hasOnlineTrophies: 'has_online_trophies',
  description: 'description',
  statusExplanation: 'status_explanation',
  platformGameId: 'platform_game_id',
  radarProfile: 'radar_profile',
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
