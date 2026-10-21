import {
  ACHIEVEMENT_I18N,
  ACHIEVEMENT_PK,
  ACHIEVEMENT_STRUCT,
  GAME_FK,
  GAME_I18N,
  GAME_PK,
  GAME_STRUCT,
  GAME_TYPE,
  GUIDE_I18N,
  GUIDE_PK,
  GUIDE_SHEET_TYPE,
  GUIDE_STRUCT,
  TABLES,
} from './gameSchema';
import { formatHardwareValue } from './gameSlug';
import {
  GUIDE_PUBLICATION,
  guideStatusKey,
  parseStatusMap,
  publishingFieldsFromStatus,
} from './guidePublication';
import { normalizeLocale } from './locale';
import { mergeLocalizedValue } from './translationUtils';
import { normalizeTrophyVideoInput, getYouTubeVideoId } from '../utils/videoUrl';

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

/** Diese Typen gehören in die Sitemap. Quickwin, easy_platin, Servertot und Unlesbar bleiben noindex. */
const INDEXABLE_GAME_TYPES = new Set([
  GAME_TYPE.STANDARD,
  GAME_TYPE.PREMIUM,
  GAME_TYPE.EVERGREEN,
]);

/**
 * Setzt games.spiel_typ auf einen der redaktionellen Typen.
 * Standard, Premium und Evergreen setzen is_indexable mit auf true.
 * Quickwin, easy_platin, Servertot und Unlesbar setzen es auf false. Der Slug bleibt unverändert.
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

  const update = {
    [GAME_STRUCT.gameType]: nextType,
    [GAME_STRUCT.isIndexable]: INDEXABLE_GAME_TYPES.has(nextType),
  };

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
 * Schreibt games.hardware als „PS4/PS5“. Mindestens eine Konsole.
 * Die Sitemap nimmt daraus nur die neueste Generation als ein URL-Segment.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string[]} segments ps5, ps4, ps3, psvita, psp
 */
export async function setGameHardware(supabase, gameId, segments) {
  const id = String(gameId ?? '').trim();
  const hardware = formatHardwareValue(segments);
  if (!id) return { hardware: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!hardware) return { hardware: null, error: new Error('Mindestens eine Konsole auswählen.') };

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({ [GAME_STRUCT.hardware]: hardware })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.hardware)
    .maybeSingle();

  if (error) return { hardware: null, error };
  return { hardware: data?.[GAME_STRUCT.hardware] ?? hardware, error: null };
}

/**
 * Zählt Online-/Verpassbar-Flags neu und schreibt die Spiel-Summen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} game
 */
async function recountTrophyFlagTotals(supabase, game) {
  const { data, error: readError } = await supabase
    .from(TABLES.achievements)
    .select(`${ACHIEVEMENT_STRUCT.isMissable}, ${ACHIEVEMENT_STRUCT.isOnline}`)
    .eq(GAME_FK, game);

  if (readError) return { totals: null, error: readError };

  const rows = data ?? [];
  const missable = rows.filter((row) => row[ACHIEVEMENT_STRUCT.isMissable]).length;
  const online = rows.filter((row) => row[ACHIEVEMENT_STRUCT.isOnline]).length;
  const totals = {
    [GAME_STRUCT.hasMissableTrophies]: missable > 0,
    [GAME_STRUCT.totalMissableTrophies]: missable,
    [GAME_STRUCT.hasOnlineTrophies]: online > 0,
    [GAME_STRUCT.totalOnlineTrophies]: online,
  };

  const { error: gameError } = await supabase
    .from(TABLES.games)
    .update(totals)
    .eq(GAME_PK, game);

  if (gameError) return { totals: null, error: gameError };
  return { totals, error: null };
}

/**
 * Online und Verpassbar einer Trophäe. Versteckt bleibt Sony-Bestand.
 * Zählt danach die Spiel-Summen neu, damit die Übersicht mitzieht.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} achievementId
 * @param {{ is_online?: boolean, is_missable?: boolean }} flags
 */
export async function setAchievementFlags(supabase, gameId, achievementId, flags) {
  const game = String(gameId ?? '').trim();
  const achievement = String(achievementId ?? '').trim();
  if (!game || !achievement) return { totals: null, error: new Error('Trophäe fehlt.') };

  const patch = {};
  if (typeof flags?.is_online === 'boolean') patch[ACHIEVEMENT_STRUCT.isOnline] = flags.is_online;
  if (typeof flags?.is_missable === 'boolean') patch[ACHIEVEMENT_STRUCT.isMissable] = flags.is_missable;
  if (!Object.keys(patch).length) return { totals: null, error: new Error('Keine Trophäen-Art gewählt.') };

  const { error: writeError } = await supabase
    .from(TABLES.achievements)
    .update(patch)
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement);

  if (writeError) return { totals: null, error: writeError };
  return recountTrophyFlagTotals(supabase, game);
}

/**
 * Setzt is_online für mehrere Trophäen eines Spiels und aktualisiert die Summen einmal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string[]} achievementIds
 * @param {boolean} [isOnline=true]
 */
export async function setAchievementsOnline(supabase, gameId, achievementIds, isOnline = true) {
  const game = String(gameId ?? '').trim();
  const ids = [...new Set(
    (Array.isArray(achievementIds) ? achievementIds : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )];
  if (!game || !ids.length) return { totals: null, error: new Error('Trophäen fehlen.') };

  const { error: writeError } = await supabase
    .from(TABLES.achievements)
    .update({ [ACHIEVEMENT_STRUCT.isOnline]: Boolean(isOnline) })
    .eq(GAME_FK, game)
    .in(ACHIEVEMENT_PK, ids);

  if (writeError) return { totals: null, error: writeError };
  return recountTrophyFlagTotals(supabase, game);
}

function asTipMap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  const text = String(value ?? '').trim();
  return text ? { en: text } : {};
}

/**
 * Nimmt eine Sprache aus der Tipp-Map. Fehlt der Schlüssel, bleibt die Spalte unangetastet.
 * @param {unknown} value
 * @param {string} locale
 * @returns {Record<string, string>|null|undefined}
 */
function columnWithoutLocale(value, locale) {
  const map = asTipMap(value);
  if (!Object.prototype.hasOwnProperty.call(map, locale)) return undefined;
  delete map[locale];
  return Object.keys(map).length ? map : null;
}

/** Nur guide_tip für diese Sprache leeren. Guide-Tip-lang bleibt unangetastet. */
function localeClearPatch(row, locale) {
  const patch = {};
  const tip = columnWithoutLocale(row?.[ACHIEVEMENT_I18N.guideTip], locale);
  if (tip !== undefined) patch[ACHIEVEMENT_I18N.guideTip] = tip;
  return patch;
}

/** Nur Guide-Tip-lang für diese Sprache leeren. */
function localeClearLongTipPatch(row, locale) {
  const patch = {};
  const longTip = columnWithoutLocale(row?.[ACHIEVEMENT_I18N.guideTipLong], locale);
  if (longTip !== undefined) patch[ACHIEVEMENT_I18N.guideTipLong] = longTip;
  return patch;
}

/**
 * Schreibt video_url und timestamp einer Trophäe (YouTube).
 * Leere URL löscht beide Felder.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} achievementId
 * @param {{ video_url?: string, timestamp?: string }} video
 */
export async function saveTrophyVideo(supabase, gameId, achievementId, video) {
  const game = String(gameId ?? '').trim();
  const achievement = String(achievementId ?? '').trim();
  if (!game || !achievement) return { error: new Error('Trophäe fehlt.') };

  const normalized = normalizeTrophyVideoInput(video?.video_url, video?.timestamp);
  if (normalized.error) return { error: normalized.error };

  const { error } = await supabase
    .from(TABLES.achievements)
    .update({
      [ACHIEVEMENT_STRUCT.videoUrl]: normalized.video_url || null,
      [ACHIEVEMENT_STRUCT.timestamp]: normalized.timestamp || null,
    })
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement);

  return { error: error ?? null, video: normalized };
}

/**
 * Schreibt den kurzen Guide-Tipp einer Trophäe in der aktuellen Sprache.
 * Leerer Text löscht nur guide_tip in dieser Sprache – Guide-Tip-lang bleibt.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} achievementId
 * @param {string} locale
 * @param {string} text
 */
export async function saveTrophyGuideTip(supabase, gameId, achievementId, locale, text) {
  const game = String(gameId ?? '').trim();
  const achievement = String(achievementId ?? '').trim();
  const lang = String(locale ?? '').trim();
  const next = String(text ?? '').trim();
  if (!game || !achievement) {
    return { error: new Error('Trophäe fehlt.') };
  }
  if (!lang) return { error: new Error('Keine Sprache ausgewählt.') };

  if (!next) {
    const { data, error: readError } = await supabase
      .from(TABLES.achievements)
      .select(ACHIEVEMENT_I18N.guideTip)
      .eq(GAME_FK, game)
      .eq(ACHIEVEMENT_PK, achievement)
      .maybeSingle();

    if (readError) return { error: readError };

    const patch = localeClearPatch(data, lang);
    if (!Object.keys(patch).length) return { error: null };

    const { error } = await supabase
      .from(TABLES.achievements)
      .update(patch)
      .eq(GAME_FK, game)
      .eq(ACHIEVEMENT_PK, achievement);
    return { error: error ?? null };
  }

  const { data, error: readError } = await supabase
    .from(TABLES.achievements)
    .select(ACHIEVEMENT_I18N.guideTip)
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement)
    .maybeSingle();

  if (readError) return { error: readError };

  const map = asTipMap(data?.[ACHIEVEMENT_I18N.guideTip]);
  map[lang] = next;

  const { error } = await supabase
    .from(TABLES.achievements)
    .update({ [ACHIEVEMENT_I18N.guideTip]: map })
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement);

  return { error: error ?? null };
}

/**
 * Schreibt Guide-Tip-lang einer Trophäe in der aktuellen Sprache.
 * Leerer Text entfernt nur diesen Sprachschlüssel in Guide-Tip-lang.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} achievementId
 * @param {string} locale
 * @param {string} text
 */
export async function saveTrophyGuideTipLong(supabase, gameId, achievementId, locale, text) {
  const game = String(gameId ?? '').trim();
  const achievement = String(achievementId ?? '').trim();
  const lang = String(locale ?? '').trim();
  const next = String(text ?? '').trim();
  if (!game || !achievement) {
    return { error: new Error('Trophäe fehlt.') };
  }
  if (!lang) return { error: new Error('Keine Sprache ausgewählt.') };

  if (!next) {
    const { data, error: readError } = await supabase
      .from(TABLES.achievements)
      .select(ACHIEVEMENT_I18N.guideTipLong)
      .eq(GAME_FK, game)
      .eq(ACHIEVEMENT_PK, achievement)
      .maybeSingle();

    if (readError) return { error: readError };

    const patch = localeClearLongTipPatch(data, lang);
    if (!Object.keys(patch).length) return { error: null };

    const { error } = await supabase
      .from(TABLES.achievements)
      .update(patch)
      .eq(GAME_FK, game)
      .eq(ACHIEVEMENT_PK, achievement);
    return { error: error ?? null };
  }

  const { data, error: readError } = await supabase
    .from(TABLES.achievements)
    .select(ACHIEVEMENT_I18N.guideTipLong)
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement)
    .maybeSingle();

  if (readError) return { error: readError };

  const map = asTipMap(data?.[ACHIEVEMENT_I18N.guideTipLong]);
  map[lang] = next;

  const { error } = await supabase
    .from(TABLES.achievements)
    .update({ [ACHIEVEMENT_I18N.guideTipLong]: map })
    .eq(GAME_FK, game)
    .eq(ACHIEVEMENT_PK, achievement);

  return { error: error ?? null };
}

/**
 * Löscht Kurz- und Langfassung der Guide-Tipps eines Spiels in einer Sprache.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} locale
 */
export async function clearGameGuideTips(supabase, gameId, locale) {
  const game = String(gameId ?? '').trim();
  const lang = String(locale ?? '').trim();
  if (!game) return { error: new Error('Kein Spiel ausgewählt.') };
  if (!lang) return { error: new Error('Keine Sprache ausgewählt.') };

  const { data, error: readError } = await supabase
    .from(TABLES.achievements)
    .select('*')
    .eq(GAME_FK, game);

  if (readError) return { error: readError };

  const pending = [];
  for (const row of data ?? []) {
    const patch = {
      ...localeClearPatch(row, lang),
      ...localeClearLongTipPatch(row, lang),
    };
    if (!Object.keys(patch).length) continue;
    pending.push({ id: row[ACHIEVEMENT_PK], patch });
  }

  const chunkSize = 25;
  for (let index = 0; index < pending.length; index += chunkSize) {
    const chunk = pending.slice(index, index + chunkSize);
    const results = await Promise.all(chunk.map(({ id, patch }) => (
      supabase
        .from(TABLES.achievements)
        .update(patch)
        .eq(GAME_FK, game)
        .eq(ACHIEVEMENT_PK, id)
    )));
    const failed = results.find((result) => result.error);
    if (failed) return { error: failed.error };
  }

  return { error: null };
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

function parsePlaytimeHours(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Speichert Spielzeit-Spalten auf public.games und optional den Kurztext
 * status_explanation_localized für eine Sprache.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {{ hauptstory?: unknown, komplett?: unknown, statusExplanation?: string, locale?: string }} values
 */
export async function saveGamePlaytime(
  supabase,
  gameId,
  { hauptstory, komplett, statusExplanation, locale } = {},
) {
  const id = String(gameId ?? '').trim();
  if (!id) {
    return {
      hauptstory: null,
      komplett: null,
      statusExplanation: null,
      error: new Error('Kein Spiel ausgewählt.'),
    };
  }

  const nextHauptstory = parsePlaytimeHours(hauptstory);
  const nextKomplett = parsePlaytimeHours(komplett);

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({
      spielzeit_hauptstory: nextHauptstory,
      spielzeit_komplettierer: nextKomplett,
    })
    .eq(GAME_PK, id)
    .select('spielzeit_hauptstory, spielzeit_komplettierer')
    .maybeSingle();

  if (error) {
    return { hauptstory: null, komplett: null, statusExplanation: null, error };
  }

  let nextExplanation =
    statusExplanation === undefined ? null : String(statusExplanation ?? '');

  if (statusExplanation !== undefined && locale) {
    const { data: current, error: readError } = await supabase
      .from(TABLES.games)
      .select(GAME_I18N.statusExplanation)
      .eq(GAME_PK, id)
      .maybeSingle();
    if (readError) {
      return {
        hauptstory: data?.spielzeit_hauptstory ?? nextHauptstory,
        komplett: data?.spielzeit_komplettierer ?? nextKomplett,
        statusExplanation: null,
        error: readError,
      };
    }

    const patch = {
      [GAME_I18N.statusExplanation]: mergeLocalizedValue(
        current?.[GAME_I18N.statusExplanation],
        locale,
        String(statusExplanation).trim(),
      ),
    };
    const { error: explError } = await supabase
      .from(TABLES.games)
      .update(patch)
      .eq(GAME_PK, id);
    if (explError) {
      return {
        hauptstory: data?.spielzeit_hauptstory ?? nextHauptstory,
        komplett: data?.spielzeit_komplettierer ?? nextKomplett,
        statusExplanation: null,
        error: explError,
      };
    }
    nextExplanation = String(statusExplanation).trim();
  }

  return {
    hauptstory: data?.spielzeit_hauptstory ?? nextHauptstory,
    komplett: data?.spielzeit_komplettierer ?? nextKomplett,
    statusExplanation: nextExplanation,
    error: null,
  };
}

const QUICK_GUIDE_TS = /(?:\d{1,2}:)?\d{1,2}:\d{2}/;

/**
 * Zerlegt mehrzeiligen YouTube-Timestamp-Text in Guide-Schritte.
 * Zeilen mit `# Gruppenname` setzen die Gruppe für nachfolgende Zeilen.
 * @param {string} rawText
 * @param {string} [defaultGroup]
 * @returns {{ timestamp: string|null, name: string, group: string }[]}
 */
export function parseQuickGuideText(rawText, defaultGroup = 'Allgemein') {
  let group = String(defaultGroup ?? 'Allgemein').trim() || 'Allgemein';
  const steps = [];

  for (const rawLine of String(rawText ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const next = line.replace(/^#+\s*/, '').trim();
      if (next) group = next;
      continue;
    }

    let timestamp = null;
    let name = line;

    const startMatch = line.match(new RegExp(`^(${QUICK_GUIDE_TS.source})\\s*[-–—:]?\\s*(.*)$`));
    if (startMatch) {
      timestamp = startMatch[1];
      name = String(startMatch[2] ?? '').trim() || line;
    } else {
      const endMatch = line.match(new RegExp(`^(.*?)[\\s\\-–—:]+(${QUICK_GUIDE_TS.source})$`));
      if (endMatch) {
        name = String(endMatch[1] ?? '').trim() || line;
        timestamp = endMatch[2];
      }
    }

    steps.push({ timestamp, name, group });
  }

  return steps;
}

function cleanWatchUrl(videoUrl) {
  const raw = String(videoUrl ?? '').trim();
  if (!raw) return null;
  const { video_url, error } = normalizeTrophyVideoInput(raw, '');
  if (error || !video_url) {
    const ytId = getYouTubeVideoId(raw);
    return ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
  }
  return video_url || null;
}

/**
 * Fügt geparste Guide-Schritte in public.game_guides ein.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 */
export async function insertQuickGuideSteps(
  supabase,
  {
    gameId,
    platformGameId,
    locale,
    sheetType,
    videoUrl,
    creatorId,
    trophyId,
    steps,
  },
) {
  const id = String(gameId ?? '').trim();
  const lang = normalizeLocale(locale);
  const sheet = Number(sheetType);
  const list = Array.isArray(steps) ? steps : [];

  if (!id) return { inserted: 0, status: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!lang) return { inserted: 0, status: null, error: new Error('Keine Sprache gewählt.') };
  if (
    ![GUIDE_SHEET_TYPE.WALKTHROUGH, GUIDE_SHEET_TYPE.COLLECTIBLES, GUIDE_SHEET_TYPE.BOSSES].includes(
      sheet,
    )
  ) {
    return { inserted: 0, status: null, error: new Error('Ungültiger Ziel-Reiter.') };
  }
  if (list.length === 0) {
    return { inserted: 0, status: null, error: new Error('Keine Schritte erkannt.') };
  }

  const { data: existing, error: readError } = await supabase
    .from(TABLES.guides)
    .select(GUIDE_STRUCT.guideId)
    .eq(GAME_FK, id);

  if (readError) return { inserted: 0, status: null, error: readError };

  let maxId = 0;
  for (const row of existing ?? []) {
    const match = String(row?.[GUIDE_STRUCT.guideId] ?? '').match(/\d+/);
    if (match) maxId = Math.max(maxId, Number(match[0]));
  }

  const watchUrl = cleanWatchUrl(videoUrl);
  const platformId = String(platformGameId ?? '').trim() || null;
  const creator = String(creatorId ?? '').trim() || null;
  const trophy = String(trophyId ?? '').trim() || null;
  const useCategory = sheet === GUIDE_SHEET_TYPE.COLLECTIBLES;

  const rows = list.map((step, index) => {
    const name = String(step?.name ?? '').trim() || `Schritt ${index + 1}`;
    const group = String(step?.group ?? 'Allgemein').trim() || 'Allgemein';
    const ts = String(step?.timestamp ?? '').trim() || null;
    const row = {
      [GAME_FK]: id,
      [GUIDE_STRUCT.platformGameId]: platformId,
      [GUIDE_STRUCT.guideId]: String(maxId + index + 1),
      [GUIDE_I18N.sheetType]: [sheet],
      [GUIDE_I18N.itemName]: { [lang]: name },
      [GUIDE_STRUCT.videoUrl]: watchUrl,
      [GUIDE_STRUCT.timestamp]: ts,
      [GUIDE_STRUCT.creatorId]: creator,
      [GUIDE_STRUCT.trophyId]: trophy,
      [GUIDE_STRUCT.isTrophyRelevant]: trophy ? 'Ja' : null,
    };
    if (useCategory) {
      row[GUIDE_I18N.categoryGroup] = { [lang]: group };
    } else {
      row[GUIDE_I18N.chronologicalGroup] = { [lang]: group };
    }
    return row;
  });

  const { error: insertError } = await supabase.from(TABLES.guides).insert(rows);
  if (insertError) return { inserted: 0, status: null, error: insertError };

  const { data: current, error: statusReadError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.status)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (statusReadError) {
    return { inserted: rows.length, status: null, error: statusReadError };
  }

  const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
  const key = guideStatusKey(lang);
  let statusChanged = false;

  if (String(statusMap[key] ?? '').trim().toUpperCase() !== GUIDE_PUBLICATION.PUBLISHED) {
    if (statusMap[key] !== GUIDE_PUBLICATION.DONE) {
      statusMap[key] = GUIDE_PUBLICATION.DONE;
      statusChanged = true;
    }
  }
  if (watchUrl && statusMap.guides !== 'HAS_VIDEO') {
    statusMap.guides = 'HAS_VIDEO';
    statusChanged = true;
  }

  if (!statusChanged) {
    return { inserted: rows.length, status: statusMap, error: null };
  }

  const { data: updated, error: statusError } = await supabase
    .from(TABLES.games)
    .update({ [GAME_STRUCT.status]: statusMap })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (statusError) return { inserted: rows.length, status: statusMap, error: statusError };
  return {
    inserted: rows.length,
    status: parseStatusMap(updated?.[GAME_STRUCT.status] ?? statusMap),
    error: null,
  };
}

/**
 * Löscht eine einzelne Guide-Zeile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string} guideRowId game_guides.id (UUID)
 */
export async function deleteSingleGuideStep(supabase, gameId, guideRowId) {
  const id = String(gameId ?? '').trim();
  const rowId = String(guideRowId ?? '').trim();
  if (!id || !rowId) return { error: new Error('Schritt konnte nicht gelöscht werden.') };

  const { error } = await supabase
    .from(TABLES.guides)
    .delete()
    .eq(GUIDE_PK, rowId)
    .eq(GAME_FK, id);

  return { error: error ?? null };
}
