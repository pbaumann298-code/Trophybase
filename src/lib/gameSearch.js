import { getGameTitle } from './gameModel';
import { GAME_STRUCT, GAME_TYPE } from './gameSchema';
import {
  SEARCH_RESULT_CAP,
  searchGamesByFreeText,
  searchGamesAdvanced as runAdvancedSearch,
  validateSearchQuery,
} from './gameQueries';
import { findHomeCategoryForQuery, searchHomeCategory } from './homeCategories';
import { getLocale } from './locale';

/** Suchreihenfolge: Evergreen, Premium, Standard, danach Servertot und Quickwins. */
const SEARCH_TYPE_RANK = {
  [GAME_TYPE.EVERGREEN]: 0,
  [GAME_TYPE.PREMIUM]: 1,
  [GAME_TYPE.STANDARD]: 2,
  [GAME_TYPE.SERVER_DEAD]: 3,
  [GAME_TYPE.QUICKWIN]: 3,
};

function searchTypeRank(game) {
  const type = String(game?.[GAME_STRUCT.gameType] ?? '').trim();
  return SEARCH_TYPE_RANK[type] ?? 2;
}

/** Gleiche Typen behalten die bisherige Reihenfolge (Release-Jahr). */
export function rankSearchResults(games) {
  return [...(games ?? [])].sort((a, b) => searchTypeRank(a) - searchTypeRank(b));
}

export const SEARCH_PAGE_SIZE = 50;

export const CONSOLE_FILTER_OPTIONS = [
  { value: '', labelKey: 'consoleAll' },
  { value: 'PS5', label: 'PlayStation 5' },
  { value: 'PS4', label: 'PlayStation 4' },
  { value: 'PS3', label: 'PlayStation 3' },
  { value: 'PS Vita', label: 'PS Vita' },
  { value: 'PSP', label: 'PSP' },
];

/**
 * @param {unknown[]} items
 * @param {number} page
 * @param {number} [pageSize]
 */
export function paginateItems(items, page, pageSize = SEARCH_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
    showPager: total > pageSize,
  };
}

/**
 * Suche in games.spieltitel (JSONB), games.genre, games.entwickler und games.publisher.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 * @param {{ limit?: number, locale?: string }} [options]
 */
export async function searchGames(supabase, query, options = {}) {
  const limit = options.limit ?? SEARCH_RESULT_CAP;
  const locale = options.locale ?? getLocale();
  const check = validateSearchQuery(query);

  if (!check.valid) {
    return { data: [], error: new Error(check.error) };
  }

  const catalog = options.includeReady
    ? { includeReady: true }
    : { publishedOnly: options.publishedOnly !== false };

  const rail = findHomeCategoryForQuery(check.query);
  const result = rail?.search
    ? await searchHomeCategory(supabase, rail, locale, Boolean(options.includeReady), limit)
    : await searchGamesByFreeText(supabase, check.pattern, limit, locale, catalog);

  if (result.error) return result;
  return { ...result, data: rankSearchResults(result.data) };
}

/**
 * Erweiterte Suche über einzelne Felder (UND).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ title?: string, developer?: string, genre?: string, console?: string }} filters
 * @param {{ limit?: number, locale?: string, includeReady?: boolean, publishedOnly?: boolean }} [options]
 */
export async function searchGamesAdvanced(supabase, filters, options = {}) {
  const result = await runAdvancedSearch(supabase, filters, options);
  if (result.error) return result;
  return { ...result, data: rankSearchResults(result.data) };
}

export { getGameTitle };
