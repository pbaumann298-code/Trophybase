import { TABLES, GAME_FK } from './gameSchema';
import { isUuid } from './gameModel';

export const GAME_SETTINGS = {
  hidden: 'is_hidden',
  onConflict: 'user_id,game_id',
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ ids: string[], error: Error|null }>}
 */
export async function fetchHiddenGameIds(supabase, userId) {
  if (!userId) return { ids: [], error: null };

  const { data, error } = await supabase
    .from(TABLES.gameSettings)
    .select(GAME_FK)
    .eq('user_id', userId)
    .eq(GAME_SETTINGS.hidden, true);

  if (error) return { ids: [], error };

  const ids = [];
  const seen = new Set();
  for (const row of data ?? []) {
    const id = String(row?.[GAME_FK] ?? '').trim();
    if (!isUuid(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ids, error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} gameId
 * @param {boolean} isHidden
 */
export async function upsertGameHidden(supabase, userId, gameId, isHidden) {
  if (!userId || !isUuid(gameId)) {
    return { error: new Error('Anmeldung und Spiel-ID erforderlich') };
  }

  if (!isHidden) {
    const { error } = await supabase
      .from(TABLES.gameSettings)
      .delete()
      .eq('user_id', userId)
      .eq(GAME_FK, gameId);
    return { error };
  }

  const { error } = await supabase.from(TABLES.gameSettings).upsert(
    {
      user_id: userId,
      [GAME_FK]: gameId,
      [GAME_SETTINGS.hidden]: true,
    },
    { onConflict: GAME_SETTINGS.onConflict },
  );
  return { error };
}
