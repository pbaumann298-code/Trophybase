import { TABLES, GAME_FK } from './gameSchema';
import { isUuid } from './gameModel';

export const GUIDE_PROGRESS = {
  steps: 'completed_steps',
  platinum: 'is_platinum',
  onConflict: 'user_id,game_id',
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ byGame: Record<string, { steps: string[], isPlatinum: boolean }>, error: Error|null }>}
 */
export async function fetchUserGuideProgress(supabase, userId) {
  if (!userId) return { byGame: {}, error: null };

  const { data, error } = await supabase
    .from(TABLES.guideProgress)
    .select(`${GAME_FK}, ${GUIDE_PROGRESS.steps}, ${GUIDE_PROGRESS.platinum}`)
    .eq('user_id', userId);

  if (error) return { byGame: {}, error };

  const byGame = {};
  for (const row of data ?? []) {
    const gameId = String(row?.[GAME_FK] ?? '').trim();
    if (!isUuid(gameId)) continue;
    const steps = Array.isArray(row?.[GUIDE_PROGRESS.steps])
      ? row[GUIDE_PROGRESS.steps].map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
    byGame[gameId] = {
      steps,
      isPlatinum: Boolean(row?.[GUIDE_PROGRESS.platinum]),
    };
  }
  return { byGame, error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} gameId
 * @param {string[]} steps
 * @param {boolean} [isPlatinum]
 */
export async function upsertUserGuideProgress(supabase, userId, gameId, steps, isPlatinum = false) {
  if (!userId || !isUuid(gameId)) {
    return { error: new Error('Anmeldung und Spiel-ID erforderlich') };
  }

  const uniqueSteps = [];
  const seen = new Set();
  for (const raw of steps ?? []) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueSteps.push(id);
  }

  if (uniqueSteps.length === 0 && !isPlatinum) {
    const { error } = await supabase
      .from(TABLES.guideProgress)
      .delete()
      .eq('user_id', userId)
      .eq(GAME_FK, gameId);
    return { error };
  }

  const { error } = await supabase.from(TABLES.guideProgress).upsert(
    {
      user_id: userId,
      [GAME_FK]: gameId,
      [GUIDE_PROGRESS.steps]: uniqueSteps,
      [GUIDE_PROGRESS.platinum]: Boolean(isPlatinum),
    },
    { onConflict: GUIDE_PROGRESS.onConflict },
  );
  return { error };
}

/**
 * Mehrere Spiele in die Cloud schreiben (Union bereits im Aufrufer).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, { steps: string[], isPlatinum?: boolean }>} byGame
 */
export async function upsertUserGuideProgressBulk(supabase, userId, byGame) {
  if (!userId) return { error: new Error('Anmeldung erforderlich') };

  const entries = Object.entries(byGame ?? {});
  if (entries.length === 0) return { error: null };

  const results = await Promise.all(
    entries.map(([gameId, row]) =>
      upsertUserGuideProgress(
        supabase,
        userId,
        gameId,
        row?.steps ?? [],
        Boolean(row?.isPlatinum),
      ),
    ),
  );
  return { error: results.find((r) => r.error)?.error ?? null };
}
