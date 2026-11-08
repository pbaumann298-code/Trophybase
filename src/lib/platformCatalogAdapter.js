import { localizeJsonField } from './translationUtils.js';

const PAGE_SIZE = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STEAM_GAME_COLUMNS = [
  'app_id',
  'title',
  'release_year',
  'developer',
  'publisher',
  'fsk',
  'cover_url',
  'achievement_count',
  'linked_game_id',
  'match_confidence',
  'match_status',
  'match_notes',
  'crawl_status',
].join(', ');

const XBOX_GAME_COLUMNS = [
  'title_id',
  'store_id',
  'title',
  'hardware',
  'release_year',
  'developer',
  'publisher',
  'cover_url',
  'achievement_count',
  'max_gamerscore',
  'linked_game_id',
  'match_confidence',
  'match_status',
  'match_notes',
  'crawl_status',
].join(', ');

const MATCH_STATUS_FILTERS = new Set([
  'VERIFIED',
  'AUTO_CANDIDATE',
  'SEPARATE_STACK',
  'UNLINKED',
]);

const STACK_RANK = {
  VERIFIED: 0,
  AUTO_CANDIDATE: 1,
  SEPARATE_STACK: 2,
  UNLINKED: 3,
};

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function asUuid(value) {
  const text = String(value ?? '').trim();
  return UUID_RE.test(text) ? text : '';
}

function asAppId(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Seltenheit → Stufen-Icon für TrophyTypeIcon.
 * <= 10 Gold, <= 30 Silber, sonst Bronze. Fehlender Prozentwert bleibt Bronze.
 * @param {unknown} percent
 * @returns {'gold'|'silver'|'bronze'}
 */
export function trophyTypeFromGlobalPercent(percent) {
  if (percent == null || percent === '') return 'bronze';
  const n = Number(percent);
  if (!Number.isFinite(n)) return 'bronze';
  if (n <= 10) return 'gold';
  if (n <= 30) return 'silver';
  return 'bronze';
}

function indexPsnTrophies(psnTrophies) {
  const map = new Map();
  for (const trophy of psnTrophies ?? []) {
    const key = String(trophy?.platform_achievement_id || trophy?.trophy_id || '').trim();
    if (key && !map.has(key)) map.set(key, trophy);
  }
  return map;
}

/**
 * Katalogzeile → flaches UI-Objekt im Format von mergeAchievementRecord.
 * Live-Spalten: Steam/Xbox speichern die Beschreibung in `description`
 * (nicht `trophy_desc`) und Xbox die Seltenheit in `rarity_percent`.
 * @param {Record<string, unknown>} row
 * @param {string} locale
 * @param {Map<string, object>} psnById
 * @param {'steam'|'xbox'} platform
 */
export function mapCatalogAchievementToTrophy(row, locale, psnById, platform) {
  if (!row) return null;
  const apiName = String(row.api_name || row.achievement_id || '').trim();
  if (!apiName) return null;

  const matchedId = String(row.matched_psn_trophy_id || '').trim();
  const matchedPsn = matchedId ? psnById.get(matchedId) ?? null : null;
  const rawPercent = row.global_percent ?? row.rarity_percent ?? null;
  const hasPercent = rawPercent != null && rawPercent !== '';
  const trophyDesc = localizeJsonField(row.trophy_desc ?? row.description, locale, 'en');
  const ownTip = localizeJsonField(row.guide_tip, locale, 'en', { exact: false });

  const trophy = {
    id: apiName,
    platform_achievement_id: apiName,
    trophy_id: matchedId || apiName,
    trophy_name: localizeJsonField(row.name, locale, 'en') || apiName,
    trophy_desc: trophyDesc,
    trophy_description: trophyDesc,
    trophy_desc_translation: '',
    guide_tip: ownTip || matchedPsn?.guide_tip || '',
    guide_tip_long: matchedPsn?.guide_tip_long || '',
    video_url: matchedPsn?.video_url || '',
    timestamp: matchedPsn?.timestamp || '',
    icon_url: row.icon_url || '',
    trophy_type: trophyTypeFromGlobalPercent(hasPercent ? rawPercent : null),
    global_seltenheit: hasPercent ? `${rawPercent}%` : '',
    trophy_gruppe: 'default',
    spielname: '',
    is_hidden: Boolean(row.is_hidden ?? row.is_secret),
    is_missable: Boolean(matchedPsn?.is_missable),
    is_online: Boolean(matchedPsn?.is_online),
    _platform: platform,
    _matchedPsnId: matchedId || null,
  };

  if (platform === 'xbox' || row.gamerscore != null) {
    trophy.gamerscore = row.gamerscore ?? null;
  }

  return trophy;
}

function pickPreferredStack(rows, gameUuid, idField, idValue) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const linked = gameUuid
    ? list.filter((row) => String(row?.linked_game_id ?? '') === gameUuid)
    : [];
  const byId = idValue != null
    ? list.filter((row) => String(row?.[idField] ?? '') === String(idValue))
    : [];
  const pool = linked.length > 0 ? linked : (byId.length > 0 ? byId : list);

  return [...pool].sort((a, b) => {
    const rankA = STACK_RANK[a?.match_status] ?? 9;
    const rankB = STACK_RANK[b?.match_status] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    return Number(b?.match_confidence ?? 0) - Number(a?.match_confidence ?? 0);
  })[0] ?? null;
}

async function readRows(query, label) {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`${label}:`, error.message);
      return { data: [], error };
    }
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error(`${label}:`, err?.message || err);
    return { data: [], error: err };
  }
}

/**
 * Verknüpfte Steam-/Xbox-Katalogzeilen zu einem Master-Spiel (`games.id`).
 * Xbox-Fehler (Tabelle leer oder noch nicht da) werden geschluckt.
 * @returns {Promise<{ steam: object|null, xbox: object|null }>}
 */
export async function fetchLinkedPlatformStacks(supabase, gameUuid, steamAppId = null) {
  const empty = { steam: null, xbox: null };
  if (!supabase) return empty;

  const uuid = asUuid(gameUuid);
  const appId = asAppId(steamAppId);
  if (!uuid && appId == null) return empty;

  let steamQuery = supabase.from('catalog_steam_games').select(STEAM_GAME_COLUMNS).limit(20);
  if (uuid && appId != null) {
    steamQuery = steamQuery.or(`linked_game_id.eq.${uuid},app_id.eq.${appId}`);
  } else if (uuid) {
    steamQuery = steamQuery.eq('linked_game_id', uuid);
  } else {
    steamQuery = steamQuery.eq('app_id', appId);
  }

  const steamResult = await readRows(steamQuery, 'catalog_steam_games');
  const steam = pickPreferredStack(steamResult.data, uuid, 'app_id', appId);

  let xbox = null;
  if (uuid) {
    const xboxResult = await readRows(
      supabase
        .from('catalog_xbox_games')
        .select(XBOX_GAME_COLUMNS)
        .eq('linked_game_id', uuid)
        .limit(20),
      'catalog_xbox_games',
    );
    xbox = pickPreferredStack(xboxResult.data, uuid, 'title_id', null);
  }

  return { steam, xbox };
}

/**
 * Alle Achievement-Rohzeilen eines Katalogspiels, paginiert (PostgREST-Limit 1.000).
 * @param {'steam'|'xbox'} platform
 * @returns {Promise<object[]>}
 */
export async function fetchCatalogAchievementRows(supabase, platform, platformId) {
  if (!supabase) return [];
  const isXbox = platform === 'xbox';
  const table = isXbox ? 'catalog_xbox_achievements' : 'catalog_steam_achievements';
  const idColumn = isXbox ? 'title_id' : 'app_id';
  const percentColumn = isXbox ? 'rarity_percent' : 'global_percent';
  const nameColumn = isXbox ? 'achievement_id' : 'api_name';
  const idValue = isXbox ? String(platformId ?? '').trim() : asAppId(platformId);
  if (idValue == null || idValue === '') return [];

  const rows = [];
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(idColumn, idValue)
        .order(percentColumn, { ascending: false, nullsFirst: false })
        .order(nameColumn, { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error(`${table}:`, error.message);
        return rows;
      }
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }
  } catch (err) {
    console.error(`${table}:`, err?.message || err);
  }
  return rows;
}

function mapRows(rows, locale, psnTrophies, platform) {
  const psnById = indexPsnTrophies(psnTrophies);
  return (rows ?? [])
    .map((row) => mapCatalogAchievementToTrophy(row, locale, psnById, platform))
    .filter(Boolean);
}

/**
 * Steam-Achievements als Trophäenliste für TrophyGroupedChecklist.
 * `trophy_id` bleibt die gematchte PSN-ID, damit Walkthrough und Sammelobjekte
 * über `game_guides.trophy_id` weiter auf das Steam-Icon zeigen.
 */
export async function fetchSteamAchievementsAsTrophies(supabase, appId, locale, psnTrophies = []) {
  const rows = await fetchCatalogAchievementRows(supabase, 'steam', appId);
  return mapRows(rows, locale, psnTrophies, 'steam');
}

/**
 * Xbox-Achievements als Trophäenliste. Tabelle darf leer oder fehlend sein.
 * Zusätzlich `gamerscore`.
 */
export async function fetchXboxAchievementsAsTrophies(supabase, xboxId, locale, psnTrophies = []) {
  const rows = await fetchCatalogAchievementRows(supabase, 'xbox', xboxId);
  return mapRows(rows, locale, psnTrophies, 'xbox');
}

/**
 * Admin-Katalogliste. `ACHIEVEMENTS_LOADED` filtert `crawl_status`,
 * die übrigen Werte filtern `match_status`.
 * @returns {Promise<{ games: object[], error: string }>}
 */
export async function fetchPlatformCatalogGames(
  supabase,
  platform = 'steam',
  { search = '', matchStatus = 'ALL', limit = 100, offset = 0 } = {},
) {
  if (!supabase) return { games: [], error: 'Kein Datenbank-Client.' };

  const isXbox = platform === 'xbox';
  const table = isXbox ? 'catalog_xbox_games' : 'catalog_steam_games';
  const columns = isXbox ? XBOX_GAME_COLUMNS : STEAM_GAME_COLUMNS;
  const pageLimit = clampInt(limit, 100, 1, 1000);
  const pageOffset = clampInt(offset, 0, 0, 100000);
  const status = String(matchStatus ?? 'ALL').trim() || 'ALL';
  const needle = String(search ?? '').trim().replace(/[%_\\]/g, '');

  try {
    let query = supabase.from(table).select(columns);
    if (needle) query = query.ilike('title', `%${needle}%`);
    if (status === 'ACHIEVEMENTS_LOADED') {
      query = query.eq('crawl_status', 'ACHIEVEMENTS_LOADED');
    } else if (MATCH_STATUS_FILTERS.has(status)) {
      query = query.eq('match_status', status);
    }
    const { data, error } = await query
      .order('title', { ascending: true })
      .range(pageOffset, pageOffset + pageLimit - 1);
    if (error) {
      console.error(`${table}:`, error.message);
      return { games: [], error: error.message };
    }
    return { games: data ?? [], error: '' };
  } catch (err) {
    const message = err?.message || 'Katalog konnte nicht geladen werden.';
    console.error(`${table}:`, message);
    return { games: [], error: message };
  }
}
