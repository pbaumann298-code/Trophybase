import { GAME_PK, GAME_STRUCT, GAME_TYPE, TABLES } from './gameSchema';
import { parseStatusMap } from './guidePublication';

const GAME_TYPE_VALUES = new Set(Object.values(GAME_TYPE));

/**
 * Setzt games.spiel_typ auf einen der redaktionellen Typen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} gameType
 */
export async function setIntranetGameType(supabase, gameId, gameType) {
  const id = String(gameId ?? '').trim();
  const nextType = String(gameType ?? '').trim();
  if (!id) return { gameType: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!GAME_TYPE_VALUES.has(nextType)) {
    return { gameType: null, error: new Error('Unbekannter Spieltyp.') };
  }

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.gameType)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (readError) return { gameType: null, error: readError };

  const previousType = String(current?.[GAME_STRUCT.gameType] ?? '').trim();
  const update = { [GAME_STRUCT.gameType]: nextType };
  if (nextType === GAME_TYPE.SERVER_DEAD) {
    update[GAME_STRUCT.isIndexable] = false;
  } else if (previousType === GAME_TYPE.SERVER_DEAD && nextType !== GAME_TYPE.QUICKWIN) {
    update[GAME_STRUCT.isIndexable] = true;
  }

  const { data, error } = await supabase
    .from(TABLES.games)
    .update(update)
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.gameType)
    .maybeSingle();

  if (error) return { gameType: null, error };
  return { gameType: data?.[GAME_STRUCT.gameType] ?? nextType, error: null };
}

/**
 * Entfernt einen einzelnen Schlüssel aus games.status und lässt den Rest stehen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} statusKey
 */
export async function removeIntranetStatusKey(supabase, gameId, statusKey) {
  const id = String(gameId ?? '').trim();
  const key = String(statusKey ?? '').trim();
  if (!id || !key) return { status: null, error: new Error('Status-Schlüssel fehlt.') };

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.status)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (readError) return { status: null, error: readError };

  const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
  delete statusMap[key];

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({ [GAME_STRUCT.status]: statusMap })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (error) return { status: null, error };
  return { status: parseStatusMap(data?.[GAME_STRUCT.status] ?? statusMap), error: null };
}
