import { TABLES, GAME_FK } from './gameSchema';
import { resolveGameId } from './guideQueries';

/**
 * Lädt trophy_id-Werte aus online_trophies_log für ein Spiel.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 */
export async function fetchOnlineTrophyIdsForGame(supabase, gameId) {
  const id = resolveGameId(gameId);
  if (!id) return { ids: new Set(), error: null };

  const { data, error } = await supabase
    .from(TABLES.onlineTrophiesLog)
    .select('trophy_id, game_id')
    .eq(GAME_FK, id);

  if (error) {
    console.error('online_trophies_log:', error.message, { gameId: id });
    return { ids: new Set(), error };
  }

  const ids = new Set(
    (data ?? [])
      .map((row) => row.trophy_id)
      .filter((tid) => tid != null && tid !== '')
      .map((tid) => String(tid)),
  );

  return { ids, error: null };
}

/** Beschreibung aus game_trophies (Spalte trophy_desc). */
export function getTrophyDescription(trophy) {
  if (!trophy) return '';
  return String(
    trophy.trophy_desc ?? trophy.Trophy_Desc ?? trophy.trophy_description ?? '',
  ).trim();
}

/** trophy_id als String für Abgleich mit online_trophies_log. */
export function getTrophyIdKey(trophy) {
  if (!trophy) return '';
  return String(trophy.trophy_id ?? trophy.id ?? '');
}
