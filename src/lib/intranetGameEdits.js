import { GAME_FK, GAME_I18N, GAME_PK, GAME_STRUCT, GAME_TYPE, TABLES } from './gameSchema';
import { parseStatusMap, publishingFieldsFromStatus } from './guidePublication';

/** Pipeline-Schlüssel, die einen vorhandenen Guide markieren und mit ihm wegfallen. */
const GUIDE_DISCARD_KEYS = new Set(['fertig', 'fertig_de', 'fertig_en']);

/**
 * Statusmappe, nachdem der Guide verworfen wurde.
 * guide_* (FERTIG / PUBLISHED) und die älteren fertig*-Schlüssel fallen weg,
 * guides wird NO_GUIDE. Übrige Pipeline-Keys bleiben.
 * @param {unknown} currentStatus
 */
export function statusAfterGuideDiscard(currentStatus) {
  const statusMap = { ...parseStatusMap(currentStatus) };
  for (const key of Object.keys(statusMap)) {
    if (key.startsWith('guide_') || GUIDE_DISCARD_KEYS.has(key)) delete statusMap[key];
  }
  statusMap.guides = 'NO_GUIDE';
  return statusMap;
}

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
 * Löscht alle game_guides-Zeilen eines Spiels und nimmt die Freigabe zurück.
 * publishing_status / published_locales werden geleert — eine Spalte is_published gibt es nicht.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 */
export async function discardIntranetGuide(supabase, gameId) {
  const id = String(gameId ?? '').trim();
  if (!id) return { status: null, error: new Error('Kein Spiel ausgewählt.') };

  const { error: deleteError } = await supabase
    .from(TABLES.guides)
    .delete()
    .eq(GAME_FK, id);

  if (deleteError) return { status: null, error: deleteError };

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.status)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (readError) return { status: null, error: readError };

  const nextStatus = statusAfterGuideDiscard(current?.[GAME_STRUCT.status]);
  const { data, error } = await supabase
    .from(TABLES.games)
    .update({
      [GAME_STRUCT.status]: nextStatus,
      ...publishingFieldsFromStatus(nextStatus),
    })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (error) return { status: null, error };
  return { status: parseStatusMap(data?.[GAME_STRUCT.status] ?? nextStatus), error: null };
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

/**
 * IGDB-Bildlink auf die große Cover-Variante bringen.
 * Akzeptiert images.igdb.com-URLs und nackte Bild-IDs wie co2l7t.
 * @param {string} input
 * @returns {string|null}
 */
export function parseIgdbCoverUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const bare = raw.match(/^[a-z0-9]{4,}$/i);
  if (bare) {
    return `https://images.igdb.com/igdb/image/upload/t_1080p/${bare[0]}.jpg`;
  }

  const withProtocol = raw.startsWith('//') ? `https:${raw}` : raw;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'images.igdb.com') return null;

  const match = parsed.pathname.match(
    /\/upload\/(?:t_[a-z0-9_]+\/)?([a-z0-9]+)\.(?:jpe?g|png|webp)$/i,
  );
  if (!match) return null;
  return `https://images.igdb.com/igdb/image/upload/t_1080p/${match[1]}.jpg`;
}

/**
 * Setzt das Cover aus einem IGDB-Bildlink und markiert status.igdb als COMPLETED,
 * damit der nächste Pipeline-Lauf dieses Cover nicht wieder ersetzt.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} imageUrl
 */
export async function setIntranetIgdbCover(supabase, gameId, imageUrl) {
  const id = String(gameId ?? '').trim();
  const coverUrl = parseIgdbCoverUrl(imageUrl);
  if (!id) return { coverUrl: null, status: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!coverUrl) {
    return {
      coverUrl: null,
      status: null,
      error: new Error('Bitte einen Bildlink von images.igdb.com einfügen.'),
    };
  }

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(`${GAME_STRUCT.status}, ${GAME_I18N.coverUrl}`)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (readError) return { coverUrl: null, status: null, error: readError };

  const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
  statusMap.igdb = 'COMPLETED';
  delete statusMap.igdb_reason;

  const existing = current?.[GAME_I18N.coverUrl];
  const cover = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  for (const key of Object.keys(cover)) cover[key] = coverUrl;
  cover.de = coverUrl;
  cover.en = coverUrl;

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({
      [GAME_I18N.coverUrl]: cover,
      [GAME_STRUCT.status]: statusMap,
    })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (error) return { coverUrl: null, status: null, error };
  return {
    coverUrl,
    status: parseStatusMap(data?.[GAME_STRUCT.status] ?? statusMap),
    error: null,
  };
}

/**
 * Entfernt das Cover und den Pipeline-Schlüssel status.igdb.
 * Die übrigen Status-Werte, inklusive guide_de, bleiben stehen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 */
export async function clearIntranetCover(supabase, gameId) {
  const id = String(gameId ?? '').trim();
  if (!id) return { status: null, error: new Error('Kein Spiel ausgewählt.') };

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.status)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (readError) return { status: null, error: readError };

  const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
  delete statusMap.igdb;

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({
      [GAME_I18N.coverUrl]: {},
      [GAME_STRUCT.status]: statusMap,
    })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (error) return { status: null, error };
  return { status: parseStatusMap(data?.[GAME_STRUCT.status] ?? statusMap), error: null };
}
