import {
  TABLES,
  GAME_FK,
  FALLBACK_LANGUAGE,
  GUIDE_STRUCT,
  GUIDE_I18N,
  GUIDE_SHEET_TYPE,
  resolveSheetTypes,
  hasSheetType,
} from './gameSchema';
import { getLocale } from './locale';
import { getGameUuid, getRouteSlug } from './gameModel';
import { localizeJsonField } from './translationUtils';
import { resolveGuideLanguage } from './localeResolver';
import { resolveGameUuid } from './gameQueries';

export { resolveGuideLanguage, hasSheetType };

/**
 * @param {object|string|null|undefined} gameOrId
 */
export function resolveGameId(gameOrId) {
  if (gameOrId == null) return '';
  if (typeof gameOrId === 'string' || typeof gameOrId === 'number') {
    return String(gameOrId).trim();
  }
  return getGameUuid(gameOrId) || getRouteSlug(gameOrId) || '';
}

/**
 * game_guides hat keine sort_order-Spalte; local_id trägt die Nummer aus der
 * Quelltabelle (bei Bossen mit „B_"-Präfix, z. B. „B_12"). Ohne local_id
 * bleibt die Ladereihenfolge (created_at) erhalten.
 * @param {unknown} localId
 * @param {number} index
 */
function guideSortOrder(localId, index) {
  const match = String(localId ?? '').match(/\d+/);
  if (!match) return index;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : index;
}

/**
 * Mappt eine game_guides-Zeile in ein sprachauflöstes Frontend-Objekt.
 * @param {Record<string, unknown>} row
 * @param {string} lang
 * @param {number} [index] Position in der Ladereihenfolge (Sort-Fallback)
 */
export function mergeGuideRow(row, lang, index = 0) {
  if (!row) return null;

  const guideId = row[GUIDE_STRUCT.id] ?? row.guide_id ?? null;
  const localId = row[GUIDE_STRUCT.localId] ?? null;
  const sheetTypes = resolveSheetTypes(row[GUIDE_I18N.sheetType]);
  const itemName = localizeJsonField(row[GUIDE_I18N.itemName], lang, FALLBACK_LANGUAGE);
  const chronologicalGroup = localizeJsonField(
    row[GUIDE_I18N.chronologicalGroup],
    lang,
    FALLBACK_LANGUAGE,
  );
  const categoryGroup = localizeJsonField(row[GUIDE_I18N.categoryGroup], lang, FALLBACK_LANGUAGE);
  const videoChapter = localizeJsonField(row[GUIDE_I18N.videoChapter], lang, FALLBACK_LANGUAGE);
  const trophyId = row[GUIDE_STRUCT.trophyId] ?? null;

  return {
    ...row,
    guide_id: guideId,
    local_id: localId,
    game_id: String(row[GAME_FK] ?? ''),
    sheet_types: sheetTypes,
    // Nur der primäre Reiter – zum Filtern ist sheet_types maßgeblich,
    // da ein Eintrag in mehreren Reitern stehen kann (z. B. [1, 2]).
    sheet_type: sheetTypes[0] ?? 0,
    item_name: itemName,
    chronological_group: chronologicalGroup,
    category_group: categoryGroup,
    video_chapter: videoChapter,
    timestamp: row[GUIDE_STRUCT.timestamp] ?? '',
    video_url: row[GUIDE_STRUCT.videoUrl] ?? '',
    sort_order: guideSortOrder(localId, index),
    trophy_id: trophyId,
    // Boss-Aliase (sheet_type === 3)
    boss_id: guideId,
    boss_name: itemName,
    is_trophy_relevant: row[GUIDE_STRUCT.isTrophyRelevant] ?? (trophyId ? 'Ja' : ''),
  };
}

/**
 * Lädt alle Guide-Einträge eines Spiels aus game_guides.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameRef
 * @param {string} [locale]
 * @param {string|null} [overrideLang]
 */
export async function fetchGuidesForGame(
  supabase,
  gameRef,
  locale = getLocale(),
  overrideLang = null,
) {
  const { uuid, error } = await resolveGameUuid(supabase, gameRef);
  if (error) return { data: [], error };
  if (!uuid) return { data: [], error: null };

  const targetLang = resolveGuideLanguage(locale, overrideLang);

  const { data, error: queryError } = await supabase
    .from(TABLES.guides)
    .select('*')
    .eq(GAME_FK, uuid)
    .order(GUIDE_STRUCT.createdAt, { ascending: true, nullsFirst: false });

  if (queryError) return { data: [], error: queryError };

  const merged = (data ?? [])
    .map((row, index) => mergeGuideRow(row, targetLang, index))
    .filter(Boolean);

  return { data: merged, error: null };
}

/** @deprecated Nutze fetchGuidesForGame + sheet_type-Filter */
export async function fetchChaptersForGame(supabase, gameRef, locale, overrideLang) {
  const { data, error } = await fetchGuidesForGame(supabase, gameRef, locale, overrideLang);
  return {
    data: data.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.WALKTHROUGH)),
    error,
  };
}

/** @deprecated Nutze fetchGuidesForGame + sheet_type-Filter */
export async function fetchBossesForGame(supabase, gameRef, locale, overrideLang) {
  const { data, error } = await fetchGuidesForGame(supabase, gameRef, locale, overrideLang);
  return {
    data: data.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.BOSSES)),
    error,
  };
}

/**
 * Eine Abfrage auf game_guides, aufgeteilt nach sheet_type für die Reiter.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameRef
 * @param {string} [locale]
 * @param {string|null} [overrideLang]
 */
export async function fetchGameGuideBundle(
  supabase,
  gameRef,
  locale = getLocale(),
  overrideLang = null,
) {
  const empty = {
    allGuides: [],
    guides: [],
    chapters: [],
    bosses: [],
    walkthrough: [],
    collectibles: [],
    guidesError: null,
    chaptersError: null,
    bossesError: null,
  };

  const { data, error } = await fetchGuidesForGame(supabase, gameRef, locale, overrideLang);
  if (error) {
    return {
      ...empty,
      guidesError: error,
      chaptersError: error,
      bossesError: error,
    };
  }

  // Doppelt gelistete Einträge (sheet_types [1, 2]) erscheinen bewusst in
  // beiden Reitern.
  const walkthrough = data.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.WALKTHROUGH));
  const collectibles = data.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.COLLECTIBLES));
  const bosses = data.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.BOSSES));

  return {
    allGuides: data,
    walkthrough,
    collectibles,
    // Legacy-Aliase für GameDetailPage / app.jsx
    chapters: walkthrough,
    guides: collectibles,
    bosses,
    guidesError: null,
    chaptersError: null,
    bossesError: null,
  };
}
