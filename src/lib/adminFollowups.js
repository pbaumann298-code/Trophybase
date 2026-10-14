import { supabase } from '../pages/supabaseClient';
import { GAME_I18N, GAME_PK, GAME_PLATFORM_ID, TABLES } from './gameSchema';

const CHANGE_EVENT = 'tb-admin-followups';
const TABLE = TABLES.gameWiedervorlage;
const ROW_SELECT = 'id, platform_game_id, spieltitel, freitext';

function notify(entries) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { entries } }));
}

function normalizeRow(row) {
  return {
    id: String(row?.id ?? '').trim(),
    platform_game_id: row?.platform_game_id ?? null,
    spieltitel: row?.spieltitel ?? null,
    freitext: row?.freitext ?? null,
  };
}

export async function loadAdminFollowups() {
  const { data, error } = await supabase.from(TABLE).select(ROW_SELECT);
  if (error) {
    throw new Error(error.message || 'Wiedervorlage konnte nicht geladen werden.');
  }
  return (data ?? []).map(normalizeRow).filter((entry) => entry.id);
}

async function copyFromGames(gameId, freitext) {
  const { data, error } = await supabase
    .from(TABLES.games)
    .select(`${GAME_PK}, ${GAME_PLATFORM_ID}, ${GAME_I18N.title}`)
    .eq(GAME_PK, gameId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Spiel konnte nicht gelesen werden.');
  }
  if (!data) {
    throw new Error('Spiel wurde nicht gefunden.');
  }

  const note = String(freitext ?? '').trim();
  return {
    id: data[GAME_PK],
    platform_game_id: data[GAME_PLATFORM_ID] ?? null,
    spieltitel: data[GAME_I18N.title] ?? null,
    freitext: note || null,
  };
}

/**
 * Legt eine Kopie in game_wiedervorlage an oder löscht nur diese Zeile.
 * @param {string} userId
 * @param {{ id: string, freitext?: string }} game
 */
export async function toggleAdminFollowup(userId, game) {
  const id = String(game?.id ?? '').trim();
  if (!userId || !id) {
    throw new Error('Wiedervorlage braucht eine angemeldete Admin-Sitzung.');
  }

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message || 'Wiedervorlage konnte nicht gelesen werden.');
  }

  if (existing) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(error.message || 'Wiedervorlage konnte nicht entfernt werden.');
    }
  } else {
    const row = await copyFromGames(id, game?.freitext);
    const { error } = await supabase.from(TABLE).insert(row);
    if (error) {
      throw new Error(error.message || 'Wiedervorlage konnte nicht gespeichert werden.');
    }
  }

  const next = await loadAdminFollowups();
  notify(next);
  return next;
}

export function subscribeAdminFollowups(listener) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (event) => {
    const entries = event.detail?.entries;
    if (Array.isArray(entries)) listener(entries);
  };

  window.addEventListener(CHANGE_EVENT, onCustom);
  return () => window.removeEventListener(CHANGE_EVENT, onCustom);
}
