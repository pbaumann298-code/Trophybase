import { GAME_PK } from './gameSchema';
import { getGameTitle, getRouteSlug } from './gameModel';
import {
  GAME_SEARCH_STRUCT_COLUMNS,
  GAME_SEARCH_LOCALIZED_COLUMNS,
  searchGamesByColumn,
  validateSearchQuery,
} from './gameQueries';
import { getLocale } from './locale';

/**
 * Suche in games.spieltitel (JSONB), games.genre und games.entwickler.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 * @param {{ limit?: number, locale?: string }} [options]
 */
export async function searchGames(supabase, query, options = {}) {
  const limit = options.limit ?? 60;
  const locale = options.locale ?? getLocale();
  const check = validateSearchQuery(query);

  if (!check.valid) {
    return { data: [], error: new Error(check.error) };
  }

  const [titleRes, genreRes, devRes] = await Promise.all([
    searchGamesByColumn(
      supabase,
      GAME_SEARCH_LOCALIZED_COLUMNS.title,
      check.pattern,
      limit,
      locale,
    ),
    searchGamesByColumn(
      supabase,
      GAME_SEARCH_STRUCT_COLUMNS.genre,
      check.pattern,
      limit,
      locale,
    ),
    searchGamesByColumn(
      supabase,
      GAME_SEARCH_STRUCT_COLUMNS.developer,
      check.pattern,
      limit,
      locale,
    ),
  ]);

  const error = titleRes.error ?? genreRes.error ?? devRes.error;
  if (error) {
    return { data: [], error };
  }

  const seen = new Set();
  const deduped = [];
  for (const row of [...titleRes.data, ...genreRes.data, ...devRes.data]) {
    const id = row[GAME_PK] ?? getRouteSlug(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }

  return { data: deduped.slice(0, limit), error: null };
}

export { getGameTitle };
