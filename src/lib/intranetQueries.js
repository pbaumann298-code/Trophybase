import {
  TABLES,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GAME_I18N,
  GAME_FK,
  GAME_CREATOR_MAP,
} from './gameSchema';
import { validateSearchQuery } from './gameQueries';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from './gameSlug';

export const INTRANET_GAME_LIMIT = 400;

export const INTRANET_GAME_SELECT = [
  GAME_PK,
  GAME_STRUCT.ecosystem,
  GAME_STRUCT.hardware,
  GAME_PLATFORM_ID,
  GAME_STRUCT.releaseYear,
  GAME_STRUCT.upcomingDate,
  GAME_STRUCT.developer,
  GAME_STRUCT.genre,
  GAME_STRUCT.gameType,
  GAME_STRUCT.status,
  GAME_I18N.title,
  GAME_STRUCT.slug,
].join(', ');

function quoteFilterValue(pattern) {
  return `"${String(pattern ?? '').replace(/["\\]/g, '')}"`;
}

function buildLocalizedOrFilter(column, pattern) {
  const value = quoteFilterValue(pattern);
  return SUPPORTED_LOCALES.map((lang) => `${column}->>${lang}.ilike.${value}`).join(',');
}

function textFilter(value) {
  return validateSearchQuery(value);
}

export function formatIntranetTitles(spieltitel) {
  if (typeof spieltitel === 'string' || typeof spieltitel === 'number') {
    return String(spieltitel).trim() || '—';
  }
  if (!spieltitel || typeof spieltitel !== 'object' || Array.isArray(spieltitel)) {
    return '—';
  }
  const parts = SUPPORTED_LOCALES.map((locale) => {
    const text = String(spieltitel[locale] ?? '').trim();
    return text ? `${locale.toUpperCase()} ${text}` : null;
  }).filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  const fallback = Object.values(spieltitel)
    .map((value) => String(value ?? '').trim())
    .find(Boolean);
  return fallback || '—';
}

export function intranetGameHref(game) {
  const slug = String(game?.slug ?? '').trim();
  const hardware = hardwareToUrlSegment(game?.[GAME_STRUCT.hardware]);
  if (slug && hardware) {
    return buildPrettyGamePath('de', hardware, slug);
  }
  const platformId = String(game?.[GAME_PLATFORM_ID] ?? '').trim();
  if (platformId) return `/guide/${encodeURIComponent(platformId)}`;
  const id = String(game?.[GAME_PK] ?? '').trim();
  return id ? `/guide/${encodeURIComponent(id)}` : '';
}

/**
 * Interne Spiele-Suche ohne Veröffentlichungsfilter.
 * Ausgefüllte Felder werden UND-verknüpft. Ohne Filter: alle Spiele bis zum Limit.
 */
export async function searchIntranetGames(supabase, filters = {}, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || INTRANET_GAME_LIMIT, 1), 1000);

  const title = textFilter(filters.title);
  const ecosystem = textFilter(filters.ecosystem);
  const hardware = textFilter(filters.hardware);
  const platformId = textFilter(filters.platformGameId);
  const upcoming = textFilter(filters.upcomingDate);
  const developer = textFilter(filters.developer);
  const genre = textFilter(filters.genre);
  const gameType = textFilter(filters.gameType);
  const status = textFilter(filters.status);

  const yearRaw = String(filters.releaseYear ?? '').trim();
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  let query = supabase.from(TABLES.games).select(INTRANET_GAME_SELECT, { count: 'exact' });

  if (title.valid) query = query.or(buildLocalizedOrFilter(GAME_I18N.title, title.pattern));
  if (ecosystem.valid) query = query.ilike(GAME_STRUCT.ecosystem, ecosystem.pattern);
  if (hardware.valid) query = query.ilike(GAME_STRUCT.hardware, hardware.pattern);
  if (platformId.valid) query = query.ilike(GAME_PLATFORM_ID, platformId.pattern);
  if (year != null) query = query.eq(GAME_STRUCT.releaseYear, year);
  if (upcoming.valid) query = query.ilike(GAME_STRUCT.upcomingDate, upcoming.pattern);
  if (developer.valid) query = query.ilike(GAME_STRUCT.developer, developer.pattern);
  if (genre.valid) query = query.ilike(GAME_STRUCT.genre, genre.pattern);
  if (gameType.valid) query = query.ilike(GAME_STRUCT.gameType, gameType.pattern);
  if (status.valid) query = query.ilike(GAME_STRUCT.status, status.pattern);

  const { data, error, count } = await query
    .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return { data: [], count: 0, error };
  return { data: data ?? [], count: count ?? (data ?? []).length, error: null };
}

const CREATOR_SELECT = 'id, channel_name, youtube_url';

function normalizeCreatorRow(row) {
  if (!row) return null;
  const channelName = String(row.channel_name ?? '').trim();
  const youtubeUrl = String(row.youtube_url ?? '').trim();
  if (!row.id && !channelName) return null;
  return {
    id: row.id ?? null,
    channelName,
    youtubeUrl,
  };
}

/**
 * Creator → gemappte Spiele. Leere Filter laden alle Creator mit ihren Spielen.
 */
export async function searchIntranetCreators(supabase, filters = {}) {
  const name = textFilter(filters.channelName);
  const youtube = textFilter(filters.youtubeUrl);
  const gameTitle = textFilter(filters.gameTitle);
  const contentType = String(filters.contentType ?? '').trim();
  const hasCreatorFilter = name.valid || youtube.valid;

  let gameIdsFromTitle = null;
  if (gameTitle.valid) {
    const { data: titleGames, error: titleError } = await supabase
      .from(TABLES.games)
      .select(GAME_PK)
      .or(buildLocalizedOrFilter(GAME_I18N.title, gameTitle.pattern))
      .limit(400);

    if (titleError) return { data: [], error: titleError };
    gameIdsFromTitle = (titleGames ?? []).map((row) => row[GAME_PK]).filter(Boolean);
    if (gameIdsFromTitle.length === 0) return { data: [], error: null };
  }

  let creators = [];
  if (hasCreatorFilter) {
    let creatorQuery = supabase.from(TABLES.contentCreators).select(CREATOR_SELECT);
    if (name.valid) creatorQuery = creatorQuery.ilike('channel_name', name.pattern);
    if (youtube.valid) creatorQuery = creatorQuery.ilike('youtube_url', youtube.pattern);

    const { data: creatorRows, error: creatorError } = await creatorQuery
      .order('channel_name', { ascending: true })
      .limit(200);

    if (creatorError) return { data: [], error: creatorError };
    creators = (creatorRows ?? []).map(normalizeCreatorRow).filter(Boolean);
    if (creators.length === 0) return { data: [], error: null };
  }

  let mapQuery = supabase
    .from(TABLES.gameCreatorMap)
    .select(`${GAME_CREATOR_MAP.gameId}, ${GAME_CREATOR_MAP.creatorId}, ${GAME_CREATOR_MAP.contentType}`)
    .limit(2000);

  if (hasCreatorFilter) {
    mapQuery = mapQuery.in(
      GAME_CREATOR_MAP.creatorId,
      creators.map((creator) => creator.id),
    );
  }

  if (gameIdsFromTitle) {
    mapQuery = mapQuery.in(GAME_FK, gameIdsFromTitle);
  }

  if (contentType) {
    mapQuery = mapQuery.eq(GAME_CREATOR_MAP.contentType, contentType);
  }

  const { data: maps, error: mapError } = await mapQuery;
  if (mapError) return { data: [], error: mapError };

  const mapRows = maps ?? [];
  if (mapRows.length === 0) {
    if (hasCreatorFilter) {
      return {
        data: creators.map((creator) => ({ ...creator, games: [] })),
        error: null,
      };
    }
    return { data: [], error: null };
  }

  const creatorIds = [...new Set(mapRows.map((row) => row[GAME_CREATOR_MAP.creatorId]).filter(Boolean))];
  const gameIds = [...new Set(mapRows.map((row) => row[GAME_CREATOR_MAP.gameId]).filter(Boolean))];

  if (!hasCreatorFilter) {
    const { data: mappedCreators, error: mappedError } = await supabase
      .from(TABLES.contentCreators)
      .select(CREATOR_SELECT)
      .in('id', creatorIds);

    if (mappedError) return { data: [], error: mappedError };
    creators = (mappedCreators ?? []).map(normalizeCreatorRow).filter(Boolean);
  } else if (gameIdsFromTitle) {
    const mappedSet = new Set(creatorIds);
    creators = creators.filter((creator) => mappedSet.has(creator.id));
  }

  const { data: games, error: gamesError } = await supabase
    .from(TABLES.games)
    .select(INTRANET_GAME_SELECT)
    .in(GAME_PK, gameIds);

  if (gamesError) return { data: [], error: gamesError };

  const gamesById = new Map((games ?? []).map((game) => [game[GAME_PK], game]));
  const gamesByCreator = new Map();

  for (const row of mapRows) {
    const creatorId = row[GAME_CREATOR_MAP.creatorId];
    const game = gamesById.get(row[GAME_CREATOR_MAP.gameId]);
    if (!creatorId || !game) continue;
    const list = gamesByCreator.get(creatorId) ?? [];
    list.push({
      ...game,
      contentType: row[GAME_CREATOR_MAP.contentType] || '',
    });
    gamesByCreator.set(creatorId, list);
  }

  const result = creators
    .map((creator) => ({
      ...creator,
      games: gamesByCreator.get(creator.id) ?? [],
    }))
    .filter((creator) => creator.games.length > 0 || hasCreatorFilter)
    .sort((a, b) => a.channelName.localeCompare(b.channelName, 'de'));

  return { data: result, error: null };
}
