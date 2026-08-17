import { TABLES, GAME_FK } from './gameSchema';
import { fetchAchievementsForGame } from './achievementQueries';
import { resolveGameUuid } from './gameQueries';
import { getTrophyIdKey } from './trophyQueries';
import { getLocale } from './locale';

/**
 * Verdiente Trophäen-IDs für User + Spiel (platform_achievement_id).
 * user_earned_trophies.game_id → games.id (UUID).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {unknown} gameRef
 */
export async function fetchEarnedTrophyIdsForGame(supabase, userId, gameRef) {
  if (!userId) return { ids: new Set(), error: null };

  const { uuid, error: resolveError } = await resolveGameUuid(supabase, gameRef);
  if (resolveError) {
    return { ids: new Set(), error: resolveError };
  }
  if (!uuid) {
    return { ids: new Set(), error: new Error('Spielreferenz ungültig') };
  }

  const { data, error } = await supabase
    .from(TABLES.earnedTrophies)
    .select('trophy_id')
    .eq('user_id', userId)
    .eq(GAME_FK, uuid);

  if (error) {
    console.error('user_earned_trophies:', error.message, { userId, gameId: uuid });
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

/** Set verdienter IDs → unlockedTrophies-Map für die Checkliste. */
export function earnedIdsToUnlockedMap(ids) {
  const map = {};
  for (const id of ids) {
    map[id] = true;
  }
  return map;
}

/**
 * Paralleler Abruf: game_achievements + Übersetzungen + verdiente Trophäen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null} userId
 * @param {unknown} gameRef
 * @param {string} [locale]
 */
export async function fetchGameTrophiesWithEarned(
  supabase,
  userId,
  gameRef,
  locale = getLocale(),
  overrideLang = null,
) {
  const { uuid } = await resolveGameUuid(supabase, gameRef);
  if (!uuid) {
    return { trophies: [], earnedIds: new Set(), trophiesError: null, earnedError: null };
  }

  const achievementsQuery = fetchAchievementsForGame(supabase, uuid, locale, overrideLang);
  const earnedQuery = userId
    ? fetchEarnedTrophyIdsForGame(supabase, userId, uuid)
    : Promise.resolve({ ids: new Set(), error: null });

  const [achievementsRes, earnedRes] = await Promise.all([achievementsQuery, earnedQuery]);

  if (achievementsRes.error) {
    console.error('game_achievements:', achievementsRes.error.message, { gameId: uuid });
  }

  return {
    trophies: achievementsRes.data ?? [],
    earnedIds: earnedRes.ids ?? new Set(),
    trophiesError: achievementsRes.error ?? null,
    earnedError: earnedRes.error ?? null,
  };
}

/** Zählt verdiente Trophäen in einer Liste (für Fortschrittsanzeige). */
export function countEarnedInList(trophies, earnedIds) {
  if (!trophies?.length || !earnedIds?.size) return 0;
  return trophies.filter((t) => earnedIds.has(getTrophyIdKey(t))).length;
}
