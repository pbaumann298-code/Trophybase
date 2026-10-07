import {
  TABLES,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GAME_I18N,
  GAME_FK,
  GAME_CREATOR_MAP,
  GAME_TYPE,
} from './gameSchema';
import { searchWords, validateSearchQuery } from './gameQueries';
import { applyPipelineStatusFilters } from './gamePipelineStatus';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';

export const INTRANET_GAME_LIMIT = 400;

/** Filterwert für spiel_typ null oder leer. */
export const INTRANET_GAME_TYPE_EMPTY = 'empty';

export const INTRANET_GAME_SELECT = [
  GAME_PK,
  GAME_STRUCT.ecosystem,
  GAME_STRUCT.hardware,
  GAME_PLATFORM_ID,
  GAME_STRUCT.releaseYear,
  GAME_STRUCT.upcomingDate,
  GAME_STRUCT.developer,
  GAME_STRUCT.publisher,
  GAME_STRUCT.genre,
  GAME_STRUCT.gameType,
  GAME_STRUCT.homeTags,
  GAME_STRUCT.status,
  GAME_I18N.title,
  GAME_STRUCT.slug,
].join(', ');

const INTRANET_GAME_SELECT_WITH_COUNTS = `${INTRANET_GAME_SELECT}, game_achievements(count), game_guides(count)`;

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
  // JSONB-Array: nur Containment möglich, deshalb exakte NPWR statt Teilstring.
  const platformId = String(filters.platformGameId ?? '').trim();
  const upcoming = textFilter(filters.upcomingDate);
  const developer = textFilter(filters.developer);
  const genre = textFilter(filters.genre);
  const gameType = String(filters.gameType ?? '').trim();

  const yearRaw = String(filters.releaseYear ?? '').trim();
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  const run = (select) => {
    let query = supabase.from(TABLES.games).select(select, { count: 'exact' });

    if (title.valid) {
      for (const word of searchWords(title.query)) {
        query = query.or(buildLocalizedOrFilter(GAME_I18N.title, `%${word}%`));
      }
    }
    if (ecosystem.valid) query = query.ilike(GAME_STRUCT.ecosystem, ecosystem.pattern);
    if (hardware.valid) query = query.ilike(GAME_STRUCT.hardware, hardware.pattern);
    // JSON-Syntax als String: ein JS-Array würde zum PostgreSQL-Array-Literal.
    if (platformId) query = query.contains(GAME_PLATFORM_ID, JSON.stringify([platformId]));
    if (year != null) query = query.eq(GAME_STRUCT.releaseYear, year);
    if (upcoming.valid) query = query.ilike(GAME_STRUCT.upcomingDate, upcoming.pattern);
    if (developer.valid) {
      query = query.or(
        [
          `${GAME_STRUCT.developer}.ilike.${quoteFilterValue(developer.pattern)}`,
          `${GAME_STRUCT.publisher}.ilike.${quoteFilterValue(developer.pattern)}`,
        ].join(','),
      );
    }
    if (genre.valid) query = query.ilike(GAME_STRUCT.genre, genre.pattern);
    if (gameType === INTRANET_GAME_TYPE_EMPTY) {
      query = query.or(`${GAME_STRUCT.gameType}.is.null,${GAME_STRUCT.gameType}.eq.""`);
    } else if (Object.values(GAME_TYPE).includes(gameType)) {
      query = query.eq(GAME_STRUCT.gameType, gameType);
    }
    query = applyPipelineStatusFilters(query, filters);

    return query
      .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
      .limit(limit);
  };

  let { data, error, count } = await run(INTRANET_GAME_SELECT_WITH_COUNTS);
  if (error) {
    ({ data, error, count } = await run(INTRANET_GAME_SELECT));
  }
  if (error) {
    const withoutPublisher = INTRANET_GAME_SELECT.split(', ')
      .filter((column) => column !== GAME_STRUCT.publisher)
      .join(', ');
    ({ data, error, count } = await run(`${withoutPublisher}, game_achievements(count), game_guides(count)`));
    if (error) {
      ({ data, error, count } = await run(withoutPublisher));
    }
  }

  if (error) return { data: [], count: 0, error };
  return { data: data ?? [], count: count ?? (data ?? []).length, error: null };
}

/**
 * Lädt Intranet-Zeilen für bekannte Spiel-UUIDs, ohne Veröffentlichungsfilter.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ids
 */
export async function fetchIntranetGamesByIds(supabase, ids) {
  const unique = [...new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!unique.length) return { data: [], error: null };

  let result = await fetchRowsByIds(
    supabase,
    TABLES.games,
    INTRANET_GAME_SELECT_WITH_COUNTS,
    GAME_PK,
    unique,
  );
  if (result.error) {
    result = await fetchRowsByIds(supabase, TABLES.games, INTRANET_GAME_SELECT, GAME_PK, unique);
  }
  if (result.error) return { data: [], error: result.error };

  const byId = new Map((result.data ?? []).map((game) => [game[GAME_PK], game]));
  return {
    data: unique.map((id) => byId.get(id)).filter(Boolean),
    error: null,
  };
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

async function fetchRowsByIds(supabase, table, select, column, ids, chunkSize = 120) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).select(select).in(column, chunk);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

/** PostgREST liefert pro Request höchstens 1000 Zeilen. Darüber wird weitergeblättert. */
const QUERY_PAGE_SIZE = 1000;

function chunkList(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; from < 40000; from += QUERY_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + QUERY_PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < QUERY_PAGE_SIZE) return { data: rows, error: null };
  }
  return {
    data: [],
    error: { message: 'Zu viele Treffer. Bitte die Suche enger fassen.' },
  };
}

async function fetchCreatorMapRows(supabase, { creatorIds, gameIds, contentType }) {
  const creatorChunks = creatorIds?.length ? chunkList(creatorIds, 80) : [null];
  const gameChunks = gameIds?.length ? chunkList(gameIds, 80) : [null];
  const rows = [];

  for (const creators of creatorChunks) {
    for (const games of gameChunks) {
      const page = await fetchAllPages(() => {
        let query = supabase
          .from(TABLES.gameCreatorMap)
          .select(`${GAME_CREATOR_MAP.gameId}, ${GAME_CREATOR_MAP.creatorId}, ${GAME_CREATOR_MAP.contentType}`)
          .order(GAME_CREATOR_MAP.creatorId, { ascending: true })
          .order(GAME_CREATOR_MAP.gameId, { ascending: true })
          .order(GAME_CREATOR_MAP.contentType, { ascending: true });
        if (creators) query = query.in(GAME_CREATOR_MAP.creatorId, creators);
        if (games) query = query.in(GAME_FK, games);
        if (contentType) query = query.eq(GAME_CREATOR_MAP.contentType, contentType);
        return query;
      });
      if (page.error) return page;
      rows.push(...page.data);
    }
  }

  return { data: rows, error: null };
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
    const titlePage = await fetchAllPages(() => supabase
      .from(TABLES.games)
      .select(GAME_PK)
      .or(buildLocalizedOrFilter(GAME_I18N.title, gameTitle.pattern))
      .order(GAME_PK, { ascending: true }));

    if (titlePage.error) return { data: [], error: titlePage.error };
    gameIdsFromTitle = (titlePage.data ?? []).map((row) => row[GAME_PK]).filter(Boolean);
    if (gameIdsFromTitle.length === 0) return { data: [], error: null };
  }

  let creators = [];
  if (hasCreatorFilter) {
    const creatorPage = await fetchAllPages(() => {
      let creatorQuery = supabase
        .from(TABLES.contentCreators)
        .select(CREATOR_SELECT)
        .order('channel_name', { ascending: true })
        .order('id', { ascending: true });
      if (name.valid) creatorQuery = creatorQuery.ilike('channel_name', name.pattern);
      if (youtube.valid) creatorQuery = creatorQuery.ilike('youtube_url', youtube.pattern);
      return creatorQuery;
    });

    if (creatorPage.error) return { data: [], error: creatorPage.error };
    creators = (creatorPage.data ?? []).map(normalizeCreatorRow).filter(Boolean);
    if (creators.length === 0) return { data: [], error: null };
  }

  const { data: maps, error: mapError } = await fetchCreatorMapRows(supabase, {
    creatorIds: hasCreatorFilter ? creators.map((creator) => creator.id) : null,
    gameIds: gameIdsFromTitle,
    contentType,
  });
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
    const { data: mappedCreators, error: mappedError } = await fetchRowsByIds(
      supabase,
      TABLES.contentCreators,
      CREATOR_SELECT,
      'id',
      creatorIds,
    );

    if (mappedError) return { data: [], error: mappedError };
    creators = (mappedCreators ?? []).map(normalizeCreatorRow).filter(Boolean);
  } else if (gameIdsFromTitle) {
    const mappedSet = new Set(creatorIds);
    creators = creators.filter((creator) => mappedSet.has(creator.id));
  }

  const { data: games, error: gamesError } = await fetchRowsByIds(
    supabase,
    TABLES.games,
    INTRANET_GAME_SELECT,
    GAME_PK,
    gameIds,
  );

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
