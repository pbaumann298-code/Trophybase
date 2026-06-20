import { TABLES, GAME_FK, WATCHLIST } from './gameSchema';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function fetchWatchlistGameIds(supabase, userId) {
  if (!userId) return { ids: new Set(), error: null };

  const { data, error } = await supabase
    .from(TABLES.watchlist)
    .select(GAME_FK)
    .eq('user_id', userId);

  if (error) {
    return { ids: new Set(), error };
  }

  const ids = new Set((data ?? []).map((row) => String(row[GAME_FK])).filter(Boolean));
  return { ids, error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} gameId NPWR_ID
 */
export async function addGameToWatchlist(supabase, userId, gameId) {
  if (!userId || !gameId) {
    return { data: null, error: new Error('Anmeldung und Spiel-ID erforderlich') };
  }

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    [GAME_FK]: gameId,
    [WATCHLIST.progress]: 0,
    [WATCHLIST.status]: 'active',
    last_played_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLES.watchlist)
    .upsert(row, { onConflict: 'user_id,game_id' })
    .select('id')
    .single();

  return { data, error };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} gameId
 */
export async function removeGameFromWatchlist(supabase, userId, gameId) {
  if (!userId || !gameId) {
    return { error: new Error('Anmeldung und Spiel-ID erforderlich') };
  }

  const { error } = await supabase
    .from(TABLES.watchlist)
    .delete()
    .eq('user_id', userId)
    .eq(GAME_FK, gameId);

  return { error };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} gameId
 */
export async function toggleWatchlistGame(supabase, userId, gameId, isCurrentlyOnList) {
  if (isCurrentlyOnList) {
    return removeGameFromWatchlist(supabase, userId, gameId);
  }
  return addGameToWatchlist(supabase, userId, gameId);
}
