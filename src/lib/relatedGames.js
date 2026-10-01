import {
  TABLES,
  GAME_PK,
  GAME_STRUCT,
  GAME_TYPE,
  GAME_CREATOR_MAP,
} from './gameSchema';
import { GAME_SELECT, applyGuideCatalogFilter } from './gameQueries';
import { getGameUuid, mergeGameRows } from './gameModel';
import { fetchContentCreatorsForGame } from './contentCreators';

export const SIMILAR_GAMES_MIN = 4;
const RELATED_LIMIT = 8;
const SIMILAR_FETCH = 20;

function catalogOf(includeReady) {
  return { includeReady: Boolean(includeReady), publishedOnly: !includeReady };
}

async function loadGamesByIds(supabase, gameIds, locale, includeReady, limit) {
  const ids = [...new Set((gameIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await applyGuideCatalogFilter(
    supabase.from(TABLES.games).select(GAME_SELECT).in(GAME_PK, ids),
    catalogOf(includeReady),
  )
    .neq(GAME_STRUCT.gameType, GAME_TYPE.QUICKWIN)
    .order(GAME_STRUCT.createdAt, { ascending: false })
    .limit(limit);

  if (error) return [];
  return mergeGameRows(data ?? [], locale);
}

/**
 * Andere veröffentlichte Guides derselben Creator (schon ab einem Treffer).
 */
export async function fetchCreatorOtherGames(
  supabase,
  { gameUuid, creatorIds, locale, includeReady = false, limit = RELATED_LIMIT },
) {
  const ids = [...new Set((creatorIds || []).filter(Boolean))];
  const exclude = String(gameUuid ?? '').trim();
  if (!ids.length || !exclude) return [];

  const { data: maps, error } = await supabase
    .from(TABLES.gameCreatorMap)
    .select(`${GAME_CREATOR_MAP.gameId}, ${GAME_CREATOR_MAP.creatorId}`)
    .in(GAME_CREATOR_MAP.creatorId, ids)
    .neq(GAME_CREATOR_MAP.gameId, exclude);

  if (error || !maps?.length) return [];

  const gameIds = maps.map((row) => row[GAME_CREATOR_MAP.gameId]).filter(Boolean);
  return loadGamesByIds(supabase, gameIds, locale, includeReady, limit);
}

/**
 * Ähnliche Guides (Genre, sonst Entwickler). Die Liste bleibt leer, bis
 * mindestens SIMILAR_GAMES_MIN Treffer da sind.
 */
export async function fetchSimilarGames(supabase, { game, locale, includeReady = false }) {
  const exclude = getGameUuid(game);
  if (!exclude) return [];

  const genre = String(game?.[GAME_STRUCT.genre] ?? '').trim();
  const developer = String(game?.[GAME_STRUCT.developer] ?? '').trim();
  if (!genre && !developer) return [];

  const catalog = catalogOf(includeReady);

  async function byExact(column, value) {
    if (!value) return [];
    const { data, error } = await applyGuideCatalogFilter(
      supabase.from(TABLES.games).select(GAME_SELECT).eq(column, value).neq(GAME_PK, exclude),
      catalog,
    )
      .neq(GAME_STRUCT.gameType, GAME_TYPE.QUICKWIN)
      .order(GAME_STRUCT.createdAt, { ascending: false })
      .limit(SIMILAR_FETCH);

    if (error) return [];
    return mergeGameRows(data ?? [], locale);
  }

  const [byGenre, byDeveloper] = await Promise.all([
    byExact(GAME_STRUCT.genre, genre),
    byExact(GAME_STRUCT.developer, developer),
  ]);

  const seen = new Set([exclude]);
  const merged = [];
  for (const row of [...byGenre, ...byDeveloper]) {
    const id = getGameUuid(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
  }

  if (merged.length < SIMILAR_GAMES_MIN) return [];
  return merged.slice(0, RELATED_LIMIT);
}

export async function loadRelatedGuides(supabase, game, { locale, includeReady = false, creators } = {}) {
  const creatorList =
    creators ?? (await fetchContentCreatorsForGame(supabase, game)).data ?? [];
  const creatorIds = creatorList.map((entry) => entry.id).filter(Boolean);
  const gameUuid = getGameUuid(game);

  const [creatorGames, similarGames] = await Promise.all([
    fetchCreatorOtherGames(supabase, { gameUuid, creatorIds, locale, includeReady }),
    fetchSimilarGames(supabase, { game, locale, includeReady }),
  ]);

  return { creatorGames, similarGames, creators: creatorList };
}
