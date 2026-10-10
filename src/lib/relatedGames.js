import {
  TABLES,
  GAME_PK,
  GAME_FK,
  GAME_STRUCT,
  GAME_TYPE,
  GUIDE_STRUCT,
} from './gameSchema.js';
import { getGameSelect, applyGuideCatalogFilter } from './gameQueries.js';
import { getGameUuid, mergeGameRows } from './gameModel.js';
import { fetchContentCreatorsForGame } from './contentCreators.js';
import { publicStudioCredits } from './studioCredits.js';

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
    supabase.from(TABLES.games).select(getGameSelect()).in(GAME_PK, ids),
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

  const gameIds = [];
  const seen = new Set();
  for (let from = 0; from < 5000; from += 1000) {
    const { data: links, error } = await supabase
      .from(TABLES.gameGuideCreators)
      .select(GAME_FK)
      .in(GUIDE_STRUCT.creatorId, ids)
      .neq(GAME_FK, exclude)
      .order(GAME_FK, { ascending: true })
      .range(from, from + 999);

    if (error) return [];
    if (!links?.length) break;
    for (const row of links) {
      const id = row[GAME_FK];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      gameIds.push(id);
    }
    if (links.length < 1000) break;
  }

  return loadGamesByIds(supabase, gameIds, locale, includeReady, limit);
}

/**
 * Ähnliche Guides (Genre, sonst Studio). Die Liste bleibt leer, bis
 * mindestens SIMILAR_GAMES_MIN Treffer da sind.
 */
export async function fetchSimilarGames(supabase, { game, locale, includeReady = false }) {
  const exclude = getGameUuid(game);
  if (!exclude) return [];

  const genre = String(game?.[GAME_STRUCT.genre] ?? '').trim();
  const studio = publicStudioCredits(game).studio;
  const studioQuery = studio.length >= 3 ? studio : '';
  if (!genre && !studioQuery) return [];

  const catalog = catalogOf(includeReady);

  async function byExact(column, value) {
    if (!value) return [];
    const { data, error } = await applyGuideCatalogFilter(
      supabase.from(TABLES.games).select(getGameSelect()).eq(column, value).neq(GAME_PK, exclude),
      catalog,
    )
      .neq(GAME_STRUCT.gameType, GAME_TYPE.QUICKWIN)
      .order(GAME_STRUCT.createdAt, { ascending: false })
      .limit(SIMILAR_FETCH);

    if (error) return [];
    return mergeGameRows(data ?? [], locale);
  }

  async function byStudio(column, value) {
    if (!value) return [];
    const { data, error } = await applyGuideCatalogFilter(
      supabase.from(TABLES.games).select(getGameSelect()).ilike(column, `%${value}%`).neq(GAME_PK, exclude),
      catalog,
    )
      .neq(GAME_STRUCT.gameType, GAME_TYPE.QUICKWIN)
      .order(GAME_STRUCT.createdAt, { ascending: false })
      .limit(SIMILAR_FETCH);

    if (error) return [];
    return mergeGameRows(data ?? [], locale);
  }

  const [byGenre, byDeveloper, byPublisher] = await Promise.all([
    byExact(GAME_STRUCT.genre, genre),
    byStudio(GAME_STRUCT.developer, studioQuery),
    byStudio(GAME_STRUCT.publisher, studioQuery),
  ]);

  const seen = new Set([exclude]);
  const merged = [];
  for (const row of [...byGenre, ...byDeveloper, ...byPublisher]) {
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
