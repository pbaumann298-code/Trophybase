import { TABLES, GAME_FK } from './gameSchema';
import { resolveGameId } from './guideQueries';
import { parseRouteGameRef, resolveGameUuid } from './gameQueries';

/**
 * Lädt platform_achievement_id-Werte aus online_trophies_log für ein Spiel.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameRef
 */
export async function fetchOnlineTrophyIdsForGame(supabase, gameRef) {
  const { uuid, error: resolveError } = await resolveGameUuid(supabase, gameRef);
  if (resolveError) {
    return { ids: new Set(), error: resolveError };
  }
  if (!uuid) {
    return { ids: new Set(), error: new Error('Spielreferenz ungültig') };
  }

  const routeRef = typeof gameRef === 'string' ? gameRef : resolveGameId(gameRef);
  const parsed = parseRouteGameRef(routeRef);

  const queries = [supabase.from(TABLES.onlineTrophiesLog).select('trophy_id, game_id').eq(GAME_FK, uuid)];
  if (parsed.valid && parsed.kind === 'platform') {
    queries.push(
      supabase
        .from(TABLES.onlineTrophiesLog)
        .select('trophy_id, game_id')
        .eq(GAME_FK, parsed.ref),
    );
  }

  const results = await Promise.all(queries);
  const error = results.find((r) => r.error)?.error;
  if (error) {
    console.error('online_trophies_log:', error.message, { gameRef: routeRef });
    return { ids: new Set(), error };
  }

  const ids = new Set();
  for (const res of results) {
    for (const row of res.data ?? []) {
      if (row.trophy_id != null && row.trophy_id !== '') {
        ids.add(String(row.trophy_id));
      }
    }
  }

  return { ids, error: null };
}

/** Beschreibung aus merged achievement row. */
export function getTrophyDescription(trophy) {
  if (!trophy) return '';
  return String(
    trophy.trophy_desc ??
      trophy.trophy_description ??
      trophy.Trophy_Desc ??
      '',
  ).trim();
}

/** platform_achievement_id als String für Abgleich mit Logs / earned table. */
export function getTrophyIdKey(trophy) {
  if (!trophy) return '';
  return String(
    trophy.platform_achievement_id ?? trophy.trophy_id ?? trophy.id ?? '',
  );
}
